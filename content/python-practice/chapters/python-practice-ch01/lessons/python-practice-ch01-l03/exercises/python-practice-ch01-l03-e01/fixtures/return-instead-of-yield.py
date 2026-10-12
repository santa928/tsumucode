def doubles(numbers):
    print("開始")
    for number in numbers:
        print("生成")
        return number + number

items = doubles([3, 5])
print("作成済み")
print(next(items, "END"))
print(next(items, "END"))
print(next(items, "END"))
print(next(items, "END"))
empty = doubles([])
print("空を作成")
print(next(empty, "END"))
print(next(empty, "END"))
fresh = doubles([3, 5])
print("まとめて消費")
print(list(fresh))
print(next(fresh, "END"))
