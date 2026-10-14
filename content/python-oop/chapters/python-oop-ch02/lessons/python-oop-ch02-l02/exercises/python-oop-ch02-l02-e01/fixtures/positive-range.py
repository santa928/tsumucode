class Score:
    """0から100の値を、初期化と代入の両方で検証する。"""

    def __init__(self, value):
        self.value = value

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, value):
        if 0 <= value <= 100:
            self._value = value
        else:
            raise ValueError("0から100の値が必要です")


first = Score(70)
second = Score(50)
print(first.value)
first.value = 90
print(first.value)
print(second.value)
try:
    first.value = -1
except ValueError:
    print("範囲外")
print(first.value)
try:
    first.value = 101
except ValueError:
    print("範囲外")
print(first.value)
first.value = 0
print(first.value)
first.value = 100
print(first.value)
try:
    Score(-1)
except ValueError:
    print("初期値も範囲外")
