class Gauge:
    """個別の値と、共通の倍率を持つ最小例。"""

    factor = 2

    def __init__(item, value):
        item.value = value


primary = Gauge(3)
other = Gauge(5)
same = primary
print(primary is same)
print(primary is other)
print(primary.value)
print(other.value)
print(primary.factor)
print(other.factor)
primary.factor = 7
print(primary.factor)
print(other.factor)
print(Gauge.factor)
Gauge.factor = 4
print(primary.factor)
print(other.factor)
