class Points:
    """0から100の値を、初期化と代入の両方で検証する。"""

    def __init__(owner, value):
        owner.value = value

    @property
    def value(owner):
        return owner._value

    @value.setter
    def value(owner, value):
        if value < 0 or value > 100:
            raise ValueError("0から100の値が必要です")
        owner._value = value


primary = Points(70)
secondary = Points(50)
print(primary.value)
primary.value = 90
print(primary.value)
print(secondary.value)
try:
    primary.value = -1
except ValueError:
    print("範囲外")
print(primary.value)
try:
    primary.value = 101
except ValueError:
    print("範囲外")
print(primary.value)
primary.value = 0
print(primary.value)
primary.value = 100
print(primary.value)
try:
    Points(-1)
except ValueError:
    print("初期値も範囲外")
