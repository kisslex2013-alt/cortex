# 🚀 Инструкция по деплою Phase 9 на VPS

Эта инструкция поможет перенести новые модули Jarvis (Cross-Chain Ingestor, Fork Manager, AI-Notary) на боевой сервер.

---

## 1. Обновление кода на VPS

Зайдите на ваш VPS через терминал и выполните обновление из Git:

```bash
cd /root/jarvis
git pull
```

---

## 2. Настройка API-ключа MoonPay

Для работы приёма BTC/ETH/SOL нужен API-ключ. Когда вы его получите:

1. Откройте файл `.env`:
   ```bash
   nano .env
   ```
2. Добавьте в конец файла строку (заменив `your_key` на реальный ключ):
   ```env
   MOONPAY_API_KEY=your_real_api_key_here
   ```
3. Сохраните (Ctrl+O, Enter) и выйдите (Ctrl+X).

---

## 3. Проверка готовности системы

Запустите проверочную команду, чтобы убедиться, что все новые модули загружаются без ошибок:

```bash
node -e "
  try {
    const CCI = require('./src/dispatcher/CrossChainIngestor');
    const FM  = require('./src/cortex/ForkManager');
    const CLV = require('./src/cortex/CrossLobeVerifier');
    const dna = require('./scripts/survival/dna_ledger');
    console.log('✅ Все модули Phase 9 загружены успешно');
    console.log('✅ Версия DNA Ledger:', dna.version);
  } catch (e) {
    console.error('❌ Ошибка загрузки:', e.message);
    process.exit(1);
  }
"
```

---

## 4. Тестовый запуск (Sandbox Mode)

По умолчанию система настроена на **Sandbox (тестовый режим)**. Вы можете запустить Ingestor в ручном режиме, чтобы проверить, как он создаёт адреса:

```bash
node -e "
  const CCI = require('./src/dispatcher/CrossChainIngestor');
  const FM  = require('./src/cortex/ForkManager');
  const CLV = require('./src/cortex/CrossLobeVerifier');
  
  const ingestor = new CCI({
    forkManager: new FM(),
    verifier: new CLV()
  });

  async function test() {
    console.log('Запуск Ingestor...');
    await ingestor.start();
    const btc = await ingestor.generateDepositAddress('BTC');
    console.log('Тестовый адрес BTC:', btc.address);
    process.exit(0);
  }
  
  test();
"
```

---

## 5. Переход в Production (⚠️ Опасно)

Если вы проверили всё в Sandbox и готовы принимать реальные деньги:

1. Откройте `src/dispatcher/config.js`.
2. Найдите строку `testMode: true`.
3. Измените её на `testMode: false`.
4. Перезапустите основной процесс Jarvis через PM2:
   ```bash
   pm2 restart all
   ```

---

### Полезные команды

* **Посмотреть логи депозитов:** `tail -f logs/crosschain.log` (если настроен вывод в файл) или `pm2 logs`.
* **Статус форков:** `redis-cli hgetall jarvis:fork:registry`.
* **Проверка DNA:** `node -e "require('./scripts/survival/dna_ledger').getChainIntegrity().then(console.log)"`.
