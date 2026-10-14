from functools import wraps


def trace_attempts(prefix):
    """表示用の設定を受け取り、装飾用Functionを返す。"""
    def transform(operation):
        attempts = 0

        @wraps(operation)
        def relay(*args, **kwargs):
            nonlocal attempts
            attempts += 1
            print(prefix, attempts)
            return operation(*args, **kwargs)

        return relay

    return transform


def add(value, extra=0):
    """非負の値へ追加分を足す。"""
    if value < 0:
        raise ValueError("負の値")
    return value + extra


original = add
configured = trace_attempts("加算")
transformd = configured(add)


@trace_attempts("倍算")
def double(value, extra=0):
    """非負の値を2倍して追加分を足す。"""
    if value < 0:
        raise ValueError("負の値")
    return value * 2 + extra


again = configured(add)

print(transformd(3, extra=2))
print(transformd(4, 1))
print(double(3, extra=1))
print(again(2))
try:
    transformd(-1, extra=2)
except ValueError as error:
    print(str(error))
print(transformd(2))
print(double(4))
print(again(3))
print(transformd.__name__ == original.__name__)
print(transformd.__doc__ == original.__doc__)
print(transformd.__wrapped__ is original)
print(double.__name__)
