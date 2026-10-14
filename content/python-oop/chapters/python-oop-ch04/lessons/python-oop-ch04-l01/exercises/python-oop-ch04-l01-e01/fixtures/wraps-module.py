import functools as tools


def trace_calls(label):
    """表示用の設定を受け取り、装飾用Functionを返す。"""
    def decorate(function):
        calls = 0

        @tools.wraps(function)
        def wrapper(*args, **kwargs):
            nonlocal calls
            calls += 1
            print(label, calls)
            return function(*args, **kwargs)

        return wrapper

    return decorate


class Ledger:
    """Instanceごとに記録の合計を持つ。"""

    def __init__(self):
        self.total = 0

    def add(self, value):
        """負値を拒否し、更新後の合計を返す。"""
        if value < 0:
            raise ValueError("負の値")
        self.total += value
        return self.total


configured = trace_calls("記録")


@configured
def book(ledger, value, extra=0):
    """通常分と追加分を記録する。"""
    return ledger.add(value + extra)


@trace_calls("特典")
def bonus(ledger, value, extra=0):
    """2倍の特典と追加分を記録する。"""
    return ledger.add(value * 2 + extra)


again = configured(book.__wrapped__)
first = Ledger()
second = Ledger()

print(book(first, 3, extra=2))
print(book(first, 1))
print(bonus(second, 2, extra=1))
print(again(second, 1))
try:
    book(first, -1)
except ValueError as error:
    print(str(error))
print(first.total, second.total)
print(book(first, 2))
print(bonus(second, 3))
print(again(second, 2))
print(book.__name__, bonus.__name__)
print(book.__doc__ == book.__wrapped__.__doc__)
print(bonus.__doc__ == bonus.__wrapped__.__doc__)
print(again.__wrapped__ is book.__wrapped__)
