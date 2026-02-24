// ton_arb_scanner.js — Phase 8: TON Arbitrage Scanner Strategy
// Путь в проекте: src/dispatcher/strategies/ton_arb_scanner.js
//
// Ищет расхождения цен между TonAPI (CEX-агрегатор) и DEX-пулами (STON.fi, DeDust).
// Если разница > порога (после вычета комиссий) → сигнал на арбитраж.
// Все сделки проходят через Risk Caps из paper_trading.js.

const axios = require('axios');

// ═══════════════════════════════════════════════════════
//  КОНФИГУРАЦИЯ
// ═══════════════════════════════════════════════════════

const ARB_CONFIG = {
    // Минимальный спред для входа (после комиссий)
    minProfitableSpread: 0.8,    // 0.8% — ниже этого не торгуем
    
    // Комиссии (примерные)
    fees: {
        dexSwapFee: 0.3,         // STON.fi / DeDust берут ~0.3%
        tonGasFee: 0.05,         // ~0.05 TON за транзакцию
        slippage: 0.2,           // Допуск на проскальзывание 0.2%
    },

    // Risk Caps (зеркало paper_trading.js)
    riskCaps: {
        maxPositionSize: 0.10,   // Не более 10% портфеля
        maxDailyLoss: 0.05,      // Стоп при -5% за день
        maxDrawdown: 0.10,       // Circuit breaker при -10%
        minTimeBetweenTrades: 5 * 60 * 1000,  // 5 минут (мс)
        maxTradesPerHour: 5,
    },

    // Источники данных
    sources: {
        tonapi:   { url: 'https://tonapi.io/v2/rates?tokens=ton&currencies=usd', timeout: 5000 },
        coingecko:{ url: 'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd', timeout: 5000 },
        stonfi:   { url: 'https://api.ston.fi/v1/assets', timeout: 5000 },
        dedust:   { url: 'https://api.dedust.io/v2/pools', timeout: 5000 },
    },

    // Таймер сканирования (мс)
    scanInterval: 60000, // 1 минута
};


// ═══════════════════════════════════════════════════════
//  ОСНОВНОЙ КЛАСС
// ═══════════════════════════════════════════════════════

class TonArbScanner {
    constructor(config = ARB_CONFIG) {
        this.config = config;
        this.tradeHistory = [];
        this.metrics = {
            totalScans: 0,
            opportunitiesFound: 0,
            tradesExecuted: 0,
            totalPnL: 0,
            lastTradeTime: 0,
            dailyTradeCount: 0,
            circuitBreakerTripped: false,
            peakBalance: 0,
        };
        this.priceCache = {};  // Кеш цен для избежания rate limit
    }

    // ───────────────────────────────────────────────────
    //  ИСТОЧНИКИ ЦЕН
    // ───────────────────────────────────────────────────

    /**
     * Получить цену TON/USD с TonAPI (централизованный агрегатор)
     */
    async fetchTonApiPrice() {
        try {
            const { url, timeout } = this.config.sources.tonapi;
            const res = await axios.get(url, { timeout });
            const price = res.data.rates.TON.prices.USD;
            this.priceCache.tonapi = { price, ts: Date.now() };
            return price;
        } catch (e) {
            console.error(`[ArbScanner] TonAPI error: ${e.message}`);
            return this.priceCache.tonapi?.price || null;
        }
    }

    /**
     * Получить цену TON/USD с CoinGecko (бэкап-агрегатор)
     */
    async fetchCoinGeckoPrice() {
        try {
            const { url, timeout } = this.config.sources.coingecko;
            const res = await axios.get(url, { timeout });
            const price = res.data['the-open-network'].usd;
            this.priceCache.coingecko = { price, ts: Date.now() };
            return price;
        } catch (e) {
            console.error(`[ArbScanner] CoinGecko error: ${e.message}`);
            return this.priceCache.coingecko?.price || null;
        }
    }

    /**
     * Получить цену TON/USDT из пула STON.fi
     * STON.fi API возвращает список assets — ищем TON и берём USD-rate
     */
    async fetchStonFiPrice() {
        try {
            const { url, timeout } = this.config.sources.stonfi;
            const res = await axios.get(url, { timeout });
            // Ищем TON в списке ассетов
            const tonAsset = res.data.asset_list?.find(
                a => a.symbol === 'TON' || a.contract_address === 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'
            );
            if (tonAsset && tonAsset.dex_usd_price) {
                const price = parseFloat(tonAsset.dex_usd_price);
                this.priceCache.stonfi = { price, ts: Date.now() };
                return price;
            }
            return null;
        } catch (e) {
            console.error(`[ArbScanner] STON.fi error: ${e.message}`);
            return this.priceCache.stonfi?.price || null;
        }
    }

    /**
     * Получить цену TON/USDT из пула DeDust
     */
    async fetchDeDustPrice() {
        try {
            const { url, timeout } = this.config.sources.dedust;
            const res = await axios.get(url, { timeout });
            // Ищем пул TON/USDT
            const tonPool = res.data?.find(
                p => p.assets?.some(a => a.symbol === 'TON') &&
                     p.assets?.some(a => a.symbol === 'USDT' || a.symbol === 'USD₮')
            );
            if (tonPool) {
                // Цена = reserve(USDT) / reserve(TON)
                const tonReserve = tonPool.reserves?.[0];
                const usdtReserve = tonPool.reserves?.[1];
                if (tonReserve && usdtReserve) {
                    const price = parseFloat(usdtReserve) / parseFloat(tonReserve);
                    this.priceCache.dedust = { price, ts: Date.now() };
                    return price;
                }
            }
            return null;
        } catch (e) {
            console.error(`[ArbScanner] DeDust error: ${e.message}`);
            return this.priceCache.dedust?.price || null;
        }
    }

    // ───────────────────────────────────────────────────
    //  АНАЛИЗ СПРЕДОВ
    // ───────────────────────────────────────────────────

    /**
     * Собрать все цены параллельно
     * @returns {{ source: string, price: number }[]}
     */
    async fetchAllPrices() {
        const [tonapi, coingecko, stonfi, dedust] = await Promise.allSettled([
            this.fetchTonApiPrice(),
            this.fetchCoinGeckoPrice(),
            this.fetchStonFiPrice(),
            this.fetchDeDustPrice(),
        ]);

        const prices = [];
        if (tonapi.status === 'fulfilled' && tonapi.value)
            prices.push({ source: 'TonAPI', price: tonapi.value, type: 'aggregator' });
        if (coingecko.status === 'fulfilled' && coingecko.value)
            prices.push({ source: 'CoinGecko', price: coingecko.value, type: 'aggregator' });
        if (stonfi.status === 'fulfilled' && stonfi.value)
            prices.push({ source: 'STON.fi', price: stonfi.value, type: 'dex' });
        if (dedust.status === 'fulfilled' && dedust.value)
            prices.push({ source: 'DeDust', price: dedust.value, type: 'dex' });

        return prices;
    }

    /**
     * Найти арбитражные возможности между парами источников
     * @param {{ source: string, price: number, type: string }[]} prices
     * @returns {object[]} — массив возможностей, отсортированный по прибыльности
     */
    findOpportunities(prices) {
        if (prices.length < 2) return [];

        const opportunities = [];
        const { dexSwapFee, tonGasFee, slippage } = this.config.fees;
        const totalFees = dexSwapFee + slippage; // % — газ учтём отдельно в абсолюте

        for (let i = 0; i < prices.length; i++) {
            for (let j = i + 1; j < prices.length; j++) {
                const a = prices[i];
                const b = prices[j];

                const spread = Math.abs(a.price - b.price);
                const spreadPct = (spread / Math.min(a.price, b.price)) * 100;
                const netSpreadPct = spreadPct - totalFees;

                if (netSpreadPct >= this.config.minProfitableSpread) {
                    // Определяем направление: покупаем дешевле, «продаём» дороже
                    const buyFrom = a.price < b.price ? a : b;
                    const sellTo  = a.price < b.price ? b : a;

                    opportunities.push({
                        buySource: buyFrom.source,
                        buyPrice: buyFrom.price,
                        sellSource: sellTo.source,
                        sellPrice: sellTo.price,
                        grossSpread: spreadPct.toFixed(3),
                        netSpread: netSpreadPct.toFixed(3),
                        estimatedProfit: `${netSpreadPct.toFixed(2)}% per unit`,
                        confidence: this._calculateConfidence(buyFrom, sellTo, prices),
                    });
                }
            }
        }

        // Сортируем по прибыльности
        return opportunities.sort((a, b) => parseFloat(b.netSpread) - parseFloat(a.netSpread));
    }

    /**
     * Оценка уверенности в возможности (0-100)
     * Больше источников подтверждают разницу → выше уверенность
     */
    _calculateConfidence(buyFrom, sellTo, allPrices) {
        let score = 50; // Базовый

        // Бонус если оба типа (aggregator + dex) участвуют
        if (buyFrom.type !== sellTo.type) score += 15;

        // Бонус за количество доступных источников
        score += allPrices.length * 5;

        // Штраф если один из кешированных (старые данные)
        const buyCache = this.priceCache[buyFrom.source.toLowerCase()];
        const sellCache = this.priceCache[sellTo.source.toLowerCase()];
        if (buyCache && Date.now() - buyCache.ts > 120000) score -= 20; // >2 мин
        if (sellCache && Date.now() - sellCache.ts > 120000) score -= 20;

        return Math.max(0, Math.min(100, score));
    }

    // ───────────────────────────────────────────────────
    //  RISK MANAGEMENT
    // ───────────────────────────────────────────────────

    /**
     * Проверить все Risk Caps перед торговлей
     * @param {number} portfolioValue — текущая стоимость портфеля в USD
     * @returns {{ allowed: boolean, reason?: string }}
     */
    checkRiskCaps(portfolioValue) {
        const { riskCaps } = this.config;

        // 1. Circuit Breaker
        if (this.metrics.circuitBreakerTripped) {
            return { allowed: false, reason: '🚨 Circuit breaker tripped. Trading halted.' };
        }

        // 2. Time Throttle
        const timeSinceLast = Date.now() - this.metrics.lastTradeTime;
        if (timeSinceLast < riskCaps.minTimeBetweenTrades) {
            const waitSec = Math.ceil((riskCaps.minTimeBetweenTrades - timeSinceLast) / 1000);
            return { allowed: false, reason: `⏳ Time throttle: wait ${waitSec}s` };
        }

        // 3. Max trades per hour
        const oneHourAgo = Date.now() - 3600000;
        const recentTrades = this.tradeHistory.filter(t => t.ts > oneHourAgo);
        if (recentTrades.length >= riskCaps.maxTradesPerHour) {
            return { allowed: false, reason: `📊 Hourly trade limit (${riskCaps.maxTradesPerHour}) reached` };
        }

        // 4. Drawdown check
        if (this.metrics.peakBalance > 0) {
            const drawdown = (this.metrics.peakBalance - portfolioValue) / this.metrics.peakBalance;
            if (drawdown > riskCaps.maxDrawdown) {
                this.metrics.circuitBreakerTripped = true;
                return { allowed: false, reason: `🚨 Drawdown ${(drawdown*100).toFixed(2)}% > ${riskCaps.maxDrawdown*100}% limit` };
            }
        }

        return { allowed: true };
    }

    /**
     * Расчёт безопасного размера позиции
     * @param {number} portfolioValue
     * @param {number} price
     * @returns {number} — количество TON
     */
    calculatePositionSize(portfolioValue, price) {
        const maxUsd = portfolioValue * this.config.riskCaps.maxPositionSize;
        const maxTon = maxUsd / price;
        // Округляем вниз до 2 знаков для безопасности
        return Math.floor(maxTon * 100) / 100;
    }

    // ───────────────────────────────────────────────────
    //  ОСНОВНОЙ ЦИКЛ СКАНИРОВАНИЯ
    // ───────────────────────────────────────────────────

    /**
     * Один цикл сканирования
     * @param {number} portfolioValue — текущая стоимость портфеля (из PaperTrader)
     * @returns {object} — результат скана
     */
    async scan(portfolioValue = 1000) {
        this.metrics.totalScans++;
        console.log(`\n[ArbScanner] ── Scan #${this.metrics.totalScans} ──`);

        // 1. Собираем все цены
        const prices = await this.fetchAllPrices();
        console.log(`[ArbScanner] Sources: ${prices.map(p => `${p.source}=$${p.price.toFixed(4)}`).join(' | ')}`);

        if (prices.length < 2) {
            console.log('[ArbScanner] ⚠️ Insufficient sources, skipping.');
            return { status: 'SKIP', reason: 'Not enough price sources' };
        }

        // 2. Ищем арбитражные возможности
        const opportunities = this.findOpportunities(prices);

        if (opportunities.length === 0) {
            console.log('[ArbScanner] No profitable spreads detected.');
            return { status: 'NO_OPPORTUNITY', prices };
        }

        this.metrics.opportunitiesFound += opportunities.length;
        const best = opportunities[0];
        console.log(`[ArbScanner] 🎯 Best opportunity: Buy@${best.buySource} $${best.buyPrice.toFixed(4)} → Sell@${best.sellSource} $${best.sellPrice.toFixed(4)} | Net spread: ${best.netSpread}% | Confidence: ${best.confidence}`);

        // 3. Проверяем Risk Caps
        const riskCheck = this.checkRiskCaps(portfolioValue);
        if (!riskCheck.allowed) {
            console.log(`[ArbScanner] 🛑 ${riskCheck.reason}`);
            return { status: 'RISK_BLOCKED', reason: riskCheck.reason, opportunity: best };
        }

        // 4. Проверяем уверенность
        if (best.confidence < 50) {
            console.log(`[ArbScanner] ⚠️ Low confidence (${best.confidence}), skipping.`);
            return { status: 'LOW_CONFIDENCE', opportunity: best };
        }

        // 5. Рассчитываем размер позиции
        const positionSize = this.calculatePositionSize(portfolioValue, best.buyPrice);

        // 6. Генерируем торговый сигнал
        const signal = {
            action: 'ARB_BUY',
            amount: positionSize,
            buyAt: best.buySource,
            buyPrice: best.buyPrice,
            sellAt: best.sellSource,
            sellPrice: best.sellPrice,
            expectedProfitPct: parseFloat(best.netSpread),
            expectedProfitUsd: (positionSize * best.buyPrice * parseFloat(best.netSpread) / 100).toFixed(2),
            confidence: best.confidence,
            ts: Date.now(),
        };

        // 7. Логируем в Truth Layer и историю
        this.tradeHistory.push({ ...signal, ts: Date.now() });
        this.metrics.tradesExecuted++;
        this.metrics.lastTradeTime = Date.now();

        // Обновляем peak balance
        if (portfolioValue > this.metrics.peakBalance) {
            this.metrics.peakBalance = portfolioValue;
        }

        // await truth.logEvent('ArbScanner', 'SignalGenerated', signal);

        console.log(`[ArbScanner] ✅ SIGNAL: Buy ${positionSize} TON @ $${best.buyPrice.toFixed(4)} → Expected profit: $${signal.expectedProfitUsd}`);

        return { status: 'SIGNAL', signal };
    }

    // ───────────────────────────────────────────────────
    //  СТАТИСТИКА
    // ───────────────────────────────────────────────────

    getStats() {
        const hitRate = this.metrics.totalScans > 0
            ? ((this.metrics.opportunitiesFound / this.metrics.totalScans) * 100).toFixed(1)
            : '0.0';

        return {
            totalScans: this.metrics.totalScans,
            opportunitiesFound: this.metrics.opportunitiesFound,
            hitRate: `${hitRate}%`,
            tradesExecuted: this.metrics.tradesExecuted,
            circuitBreaker: this.metrics.circuitBreakerTripped ? '🔴 TRIPPED' : '🟢 OK',
            recentTrades: this.tradeHistory.slice(-5),
        };
    }

    /**
     * Сброс circuit breaker (ручной, через Telegram-команду)
     */
    resetCircuitBreaker() {
        this.metrics.circuitBreakerTripped = false;
        console.log('[ArbScanner] Circuit breaker reset.');
    }
}


// ═══════════════════════════════════════════════════════
//  STANDALONE ЗАПУСК (для тестирования)
// ═══════════════════════════════════════════════════════

if (require.main === module) {
    const scanner = new TonArbScanner();

    console.log('╔══════════════════════════════════════════╗');
    console.log('║  TON Arbitrage Scanner — Phase 8 v1.0    ║');
    console.log('║  Risk Caps: 10% max pos | 10% drawdown   ║');
    console.log('║  Sources: TonAPI + CoinGecko + STON.fi   ║');
    console.log('╚══════════════════════════════════════════╝');

    // Первый скан
    scanner.scan(1000).then(result => {
        console.log('\n[Result]', JSON.stringify(result, null, 2));
        console.log('\n[Stats]', JSON.stringify(scanner.getStats(), null, 2));
    });

    // Периодический скан
    setInterval(async () => {
        const result = await scanner.scan(1000);
        if (result.status === 'SIGNAL') {
            console.log('\n🎯 TRADE SIGNAL DETECTED!');
            // Здесь интеграция с PaperTrader.executeTrade()
        }
    }, ARB_CONFIG.scanInterval);
}


// ═══════════════════════════════════════════════════════
//  ЭКСПОРТ
// ═══════════════════════════════════════════════════════

module.exports = { TonArbScanner, ARB_CONFIG };
