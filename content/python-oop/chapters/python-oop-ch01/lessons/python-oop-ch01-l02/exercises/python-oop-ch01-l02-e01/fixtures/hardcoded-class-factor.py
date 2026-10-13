class Counter:
    """同じ倍率計算を、3種類の引数の渡し方で比較する。"""

    factor = 2

    def __init__(self, value):
        self.value = value

    def doubled(self):
        return self.value * self.factor

    @classmethod
    def doubled_from(cls, value):
        return value * 2

    @staticmethod
    def doubled_value(value, factor):
        return value * factor


first = Counter(3)
second = Counter(5)
print(first.doubled())
print(Counter.doubled(first))
print(Counter.doubled_from(3))
print(Counter.doubled_value(3, 2))
print(second.doubled())
print(Counter.doubled(second))
print(Counter.doubled_from(5))
print(Counter.doubled_value(5, 2))
Counter.factor = 4
print(first.doubled())
print(Counter.doubled_from(3))
print(Counter.doubled_value(3, 4))
print(Counter.doubled_value(3, 2))
