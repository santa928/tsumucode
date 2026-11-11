from lesson_tools import parse_number
entry = input()
try:
    print(parse_number(entry))
except ValueError:
    print("整数を入力してください")
print("終了")
