from lesson_tools import parse_number
text = input()
try:
    ignored = int("abc")
    number = parse_number(text)
    print(number)
except ValueError:
    print("整数を入力してください")
print("終了")
