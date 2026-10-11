from lesson_tools import add, parse_number
entries = [input(), input()]
amount = 0
try:
    for entry in entries:
        amount = add(parse_number(entry), amount)
    print(amount)
except ValueError:
    print("整数を入力してください")
print("終了")
