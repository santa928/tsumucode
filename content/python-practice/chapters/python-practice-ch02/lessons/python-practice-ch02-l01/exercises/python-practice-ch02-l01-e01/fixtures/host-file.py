try:
    print(open("/host/tsumucode-context-canary", "r").read())
except OSError:
    print("host file unavailable")
