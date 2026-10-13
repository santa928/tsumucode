class Gauge:
    """同じ倍率計算を、3種類の引数の渡し方で比較する。"""

    factor = 2

    def __init__(item, value):
        item.value = value

    def doubled(item):
        return item.value * item.factor

    @classmethod
    def doubled_from(kind, value):
        return value * kind.factor

    @staticmethod
    def doubled_value(value, factor):
        return value * factor


primary = Gauge(3)
other = Gauge(5)
print(primary.doubled())
print(Gauge.doubled(primary))
print(Gauge.doubled_from(3))
print(Gauge.doubled_value(3, 2))
print(other.doubled())
print(Gauge.doubled(other))
print(Gauge.doubled_from(5))
print(Gauge.doubled_value(5, 2))
Gauge.factor = 4
print(primary.doubled())
print(Gauge.doubled_from(3))
print(Gauge.doubled_value(3, 4))
print(Gauge.doubled_value(3, 2))
