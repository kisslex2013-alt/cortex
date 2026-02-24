#!/usr/bin/env python3
import os
import sys
import json
import asyncio
from datetime import datetime
from kreuzberg import extract_file
import hashlib

INGEST_DIR = "/root/.openclaw/workspace/memory/ingested"
WAL_PATH = "/root/.openclaw/workspace/scripts/survival/session_wal.jsonl"

async def log_truth(event, data):
    entry = {
        "timestamp": datetime.now().isoformat(),
        "event": event,
        "data": data,
        "module": "ingestor"
    }
    with open(WAL_PATH, "a") as f:
        f.write(json.dumps(entry) + "\n")

async def ingest_file(file_path):
    print(f"📂 Ingesting: {file_path}...")
    
    if not os.path.exists(file_path):
        print(f"❌ File not found: {file_path}")
        return

    try:
        # 1. Extract Text & Metadata via Kreuzberg
        result = await extract_file(file_path)
        
        file_name = os.path.basename(file_path)
        output_name = f"{file_name}.md"
        output_path = os.path.join(INGEST_DIR, output_name)

        if not os.path.exists(INGEST_DIR):
            os.makedirs(INGEST_DIR, exist_ok=True)

        # 2. Format as Markdown
        md_content = f"# 📄 Ingested Document: {file_name}\n\n"
        md_content += f"**Source Path:** `{file_path}`\n"
        md_content += f"**Ingested At:** {datetime.now().isoformat()}\n"
        md_content += f"**Mime Type:** {result.mime_type or 'unknown'}\n\n"
        
        if result.metadata:
            md_content += f"## ℹ️ Metadata\n```json\n{json.dumps(result.metadata, indent=2)}\n```\n\n"

        md_content += f"## 📝 Content\n\n{result.content}\n\n"
        md_content += "---\n*Ingested by Jarvis Universal Data Ingestor v1.0 (Python Edition)*"

        # 3. Write to Memory
        with open(output_path, "w") as f:
            f.write(md_content)

        # 4. Log to Truth
        await log_truth("DocumentProcessed", {
            "file": file_name,
            "output_path": output_path,
            "size": os.path.getsize(file_path)
        })

        print(f"✅ Successfully ingested into {output_path}")
        return output_path

    except Exception as e:
        print(f"❌ Ingestion failed: {str(e)}")
        await log_truth("Failure", {"file": file_path, "error": str(e)})

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 universal_ingestor.py <file_path>")
        sys.exit(1)
    
    file_to_ingest = os.path.abspath(sys.argv[1])
    asyncio.run(ingest_file(file_to_ingest))
