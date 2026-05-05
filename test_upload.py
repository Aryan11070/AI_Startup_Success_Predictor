"""Quick test: upload sample_test_dataset.csv to /upload endpoint."""
import urllib.request
import json

boundary = "FormBoundary7MA4YWxkTrZu0gW"

with open("sample_test_dataset.csv", "rb") as f:
    file_data = f.read()

part_header = (
    "--" + boundary + "\r\n"
    "Content-Disposition: form-data; name=\"file\"; filename=\"sample_test_dataset.csv\"\r\n"
    "Content-Type: text/csv\r\n\r\n"
).encode()
part_footer = ("\r\n--" + boundary + "--\r\n").encode()

body = part_header + file_data + part_footer

req = urllib.request.Request(
    "http://127.0.0.1:8000/upload",
    data=body,
    headers={"Content-Type": "multipart/form-data; boundary=" + boundary},
)

try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
        print("Status: 200 OK")
        print("Total rows:", data["total_rows"])
        for p in data["predictions"]:
            print(f"  Row {p['row']}: {p['predicted_status_label']} | "
                  f"success_prob={p['success_probability']}")
        print("\nSUCCESS - No feature mismatch error!")
except urllib.error.HTTPError as e:
    body = e.read()
    try:
        err = json.loads(body)
        print("HTTP Error", e.code, ":", err.get("detail", err))
    except Exception:
        print("HTTP Error", e.code, ":", body.decode())
except Exception as ex:
    print("Connection Error:", ex)
    print("Is the uvicorn server running?")
