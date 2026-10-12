values = [-2, 0, 3]
result = [item + item for item in values if item >= 0]
print(result)
empty = []
print([item + item for item in empty if item >= 0])
