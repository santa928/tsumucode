from lesson_tools import add, parse_number
texts = [input(), input()]
total = 0
try:
    for text in texts:
        total = parse_number(text)
    print(total)
except ValueError:
    print("整数を入力してください")
print("終了")
