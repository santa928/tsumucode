numbers = [3, 5]
cursor = iter(numbers)
print(next(cursor))
print(next(cursor))
print(next(cursor))
print(next(cursor))
fresh = iter(numbers)
print(next(fresh, "END"))
empty = []
empty_cursor = iter(empty)
print(next(empty_cursor, "END"))
