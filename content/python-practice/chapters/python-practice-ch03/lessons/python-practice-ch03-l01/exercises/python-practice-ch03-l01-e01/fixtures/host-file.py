try:
    print(open("/Users/santa/Documents/ReactStudy/package.json").read())
except OSError:
    print("ホストファイルは利用できません")
