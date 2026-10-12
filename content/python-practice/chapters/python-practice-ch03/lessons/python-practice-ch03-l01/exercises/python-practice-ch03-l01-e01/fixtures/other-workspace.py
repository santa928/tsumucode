try:
    print(open("/workspace/other/main.py").read())
except OSError:
    print("別Workspaceは利用できません")
