"""Test script to probe model narration length and visual quality."""
import requests, json, os

KEYS = [key.strip() for key in os.environ.get("GROQ_API_KEYS", "").split(",") if key.strip()]
URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "openai/gpt-oss-120b"

def call(messages, max_tokens=300):
    for key in KEYS:
        r = requests.post(URL, headers={"Authorization": "Bearer " + key},
            json={"model": MODEL, "temperature": 0.1, "max_completion_tokens": max_tokens,
                  "response_format": {"type": "json_object"}, "messages": messages}, timeout=20)
        if r.status_code == 200:
            return json.loads(r.json()["choices"][0]["message"]["content"])
        elif r.status_code == 429:
            continue
        else:
            print("ERR", r.status_code, r.text[:200])
    return None

# Test 1: Does model follow explicit word count instruction?
print("=== TEST 1: Word count compliance ===")
result = call([
    {"role": "system", "content": "Return JSON with key 'narration' only."},
    {"role": "user", "content": "Write a narration for a 15-second scene about binary search. The narration MUST be EXACTLY 35 words. Count every word carefully before returning. Return {\"narration\": \"...\"}"}
])
if result:
    n = result.get("narration", "")
    print(f"Words: {len(n.split())} | Text: {n}")

# Test 2: Does few-shot example work better?
print("\n=== TEST 2: Few-shot example ===")
result = call([
    {"role": "system", "content": "Return JSON with key 'narration' only."},
    {"role": "user", "content": "Topic: How plants make food. durationSeconds: 10."},
    {"role": "assistant", "content": '{"narration": "Plants capture sunlight using chlorophyll in their leaves. This energy splits water molecules and combines carbon dioxide from the air into glucose sugar, releasing oxygen as a byproduct of the reaction."}'},
    {"role": "user", "content": "Topic: Binary search algorithm. durationSeconds: 15. Write narration with AT LEAST 30 words (15 seconds x 2 words/sec)."}
])
if result:
    n = result.get("narration", "")
    print(f"Words: {len(n.split())} | Text: {n}")

print("\nDone.")
