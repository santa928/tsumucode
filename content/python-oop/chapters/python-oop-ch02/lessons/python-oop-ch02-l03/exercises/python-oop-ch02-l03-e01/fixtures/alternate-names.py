class BookShelf:
    """渡されたListを外側だけコピーし、個数と表示を提供する。"""

    def __init__(owner, titles):
        owner.titles = list(titles)

    def __len__(owner):
        return len(owner.titles)

    def __str__(owner):
        return "本:" + str(len(owner))


titles = ["A", "B"]
books = BookShelf(titles)
vacant = BookShelf([])
print(len(books))
print(books)
titles.append("C")
print(len(books))
books.titles.append("D")
print(len(books))
print(books)
print(len(vacant))
print(vacant)
