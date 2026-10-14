class Meter:
    """個別の値を2倍にする。"""

    def __init__(owner, value):
        owner.value = value

    def calculate(owner):
        return owner.value * 2


class Triple(Meter):
    """初期化を継承し、計算だけを上書きする。"""

    def calculate(owner):
        return owner.value * 3


class Gauge:
    """渡されたMeterへ計算を委譲する。"""

    def __init__(owner, counter):
        owner.counter = counter

    def read(owner):
        return owner.counter.calculate()


meter = Meter(3)
other = Meter(5)
child = Triple(3)
gauge = Gauge(meter)
other_gauge = Gauge(other)
print(meter.calculate())
print(child.calculate())
print(gauge.read())
meter.value = 4
print(gauge.read())
print(other_gauge.read())
print(child.calculate())
