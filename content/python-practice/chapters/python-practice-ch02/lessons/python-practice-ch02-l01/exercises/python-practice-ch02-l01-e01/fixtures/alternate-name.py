from io import StringIO

with StringIO("通常") as first_stream:
    print(first_stream.getvalue())
    print(first_stream.closed)
print(first_stream.closed)

try:
    with StringIO("例外") as error_stream:
        print(error_stream.getvalue())
        print(error_stream.closed)
        raise ValueError("中断")
except ValueError:
    print("例外を受け止めた")
print(error_stream.closed)

try:
    print(error_stream.getvalue())
except ValueError:
    print("終了後は利用できない")
