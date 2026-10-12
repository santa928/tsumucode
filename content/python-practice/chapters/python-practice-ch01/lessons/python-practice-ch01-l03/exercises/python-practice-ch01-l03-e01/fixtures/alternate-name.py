def twice(values):
    print("開始")
    for item in values:
        print("生成")
        yield item + item

items = twice([3, 5])
print("作成済み")
print(next(items, "END"))
print(next(items, "END"))
print(next(items, "END"))
print(next(items, "END"))
empty = twice([])
print("空を作成")
print(next(empty, "END"))
print(next(empty, "END"))
fresh = twice([3, 5])
print("まとめて消費")
print(list(fresh))
print(next(fresh, "END"))
