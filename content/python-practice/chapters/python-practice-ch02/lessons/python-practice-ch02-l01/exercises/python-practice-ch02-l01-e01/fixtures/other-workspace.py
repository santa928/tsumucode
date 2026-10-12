try:
    print(open("/workspace/other/main.py", "r").read())
except OSError:
    print("other workspace unavailable")
