class ReadingList:
    """渡されたListを外側だけコピーし、個数と表示を提供する。"""

    def __init__(self, titles):
        self.titles = list(titles)

    def __len__(self):
        return len(self.titles)

    def __str__(self):
        return "本:" + str(len(self))


titles = ["A", "B"]
shelf = ReadingList(titles)
empty = ReadingList([])
print(len(shelf))
print(shelf)
titles.append("C")
print(len(shelf))
shelf.titles.append("D")
print(len(shelf))
print(shelf)
print(len(empty))
print(empty)
