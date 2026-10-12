numbers = [-2, 0, 3]
result = [number + number for number in numbers if number > 0]
print(result)
empty = []
print([number + number for number in empty if number >= 0])
