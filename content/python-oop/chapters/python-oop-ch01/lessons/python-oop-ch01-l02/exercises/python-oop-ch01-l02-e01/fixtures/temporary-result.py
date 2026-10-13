class Counter:
    """同じ倍率計算を、3種類の引数の渡し方で比較する。"""

    factor = 2

    def __init__(self, value):
        self.value = value

    def doubled(self):
        result = self.value * self.factor
        return result

    @classmethod
    def doubled_from(cls, value):
        result = value * cls.factor
        return result

    @staticmethod
    def doubled_value(value, factor):
        result = value * factor
        return result


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
