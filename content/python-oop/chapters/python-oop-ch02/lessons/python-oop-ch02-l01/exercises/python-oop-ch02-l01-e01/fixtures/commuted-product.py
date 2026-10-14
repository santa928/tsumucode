class Counter:
    """個別の値を2倍にする。"""

    def __init__(self, value):
        self.value = value

    def calculate(self):
        return 2 * self.value


class TripledCounter(Counter):
    """初期化を継承し、計算だけを上書きする。"""

    def calculate(self):
        return 3 * self.value


class CounterView:
    """渡されたCounterへ計算を委譲する。"""

    def __init__(self, counter):
        self.counter = counter

    def read(self):
        return self.counter.calculate()


base = Counter(3)
other = Counter(5)
child = TripledCounter(3)
view = CounterView(base)
other_view = CounterView(other)
print(base.calculate())
print(child.calculate())
print(view.read())
base.value = 4
print(view.read())
print(other_view.read())
print(child.calculate())
