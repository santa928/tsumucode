from lesson_tools import parse_number
text = input()
number = parse_number(text)
try:
    print(number)
except ValueError:
    print("整数を入力してください")
print("終了")
