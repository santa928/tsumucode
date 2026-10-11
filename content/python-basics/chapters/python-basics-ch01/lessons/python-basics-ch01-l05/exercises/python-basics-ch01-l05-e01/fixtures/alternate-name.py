values = [3, 5]
shared = values
shared[0] = 4
total = 0
for item in values:
    total += item
print(values[0])
print(total)
