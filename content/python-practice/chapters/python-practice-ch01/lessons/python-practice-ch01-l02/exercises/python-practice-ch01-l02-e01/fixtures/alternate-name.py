values = [3, 5]
position = iter(values)
print(next(position, "END"))
print(next(position, "END"))
print(next(position, "END"))
print(next(position, "END"))
fresh = iter(values)
print(next(fresh, "END"))
empty = []
empty_position = iter(empty)
print(next(empty_position, "END"))
