from functools import wraps


def trace_calls(label):
    """表示用の設定を受け取り、装飾用Functionを返す。"""
    def decorate(function):
        calls = 0

        @wraps(function)
        def wrapper(*args, **kwargs):
            nonlocal calls
            calls = 1 + calls
            print(label, calls)
            return function(*args, **kwargs)

        return wrapper

    return decorate


def add(value, extra=0):
    """非負の値へ追加分を足す。"""
    if value < 0:
        raise ValueError("負の値")
    return value + extra


original = add
configured = trace_calls("加算")
decorated = configured(add)


@trace_calls("倍算")
def double(value, extra=0):
    """非負の値を2倍して追加分を足す。"""
    if value < 0:
        raise ValueError("負の値")
    return value * 2 + extra


again = configured(add)

print(decorated(3, extra=2))
print(decorated(4, 1))
print(double(3, extra=1))
print(again(2))
try:
    decorated(-1, extra=2)
except ValueError as error:
    print(str(error))
print(decorated(2))
print(double(4))
print(again(3))
print(decorated.__name__ == original.__name__)
print(decorated.__doc__ == original.__doc__)
print(decorated.__wrapped__ is original)
print(double.__name__)
