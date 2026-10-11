from lesson_tools import add, parse_number
texts = [input(), input()]
total = 0
for text in texts:
    total = add(total, parse_number(text))
print(total)
print("終了")
