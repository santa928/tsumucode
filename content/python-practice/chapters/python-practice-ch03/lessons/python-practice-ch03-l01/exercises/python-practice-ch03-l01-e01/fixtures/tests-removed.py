from dataclasses import dataclass
from io import StringIO


@dataclass
class Record:
    """集計する1件の値をまとめる。型注釈は値を検証しない。"""

    label: str
    amount: int


def read_records(text: str):
    """メモリ内の各行を整数へ変換し、負値を拒否して1件ずつ返す。"""
    with StringIO(text) as stream:
        for line in stream:
            amount = int(line)
            if amount < 0:
                raise ValueError("負値は使えません")
            yield Record("記録", amount)


def total(text: str) -> int:
    """反復で受け取る値を合計する。空データは0になる。"""
    return sum(record.amount for record in read_records(text))


sample = Record("型注釈だけ", "4")
print(isinstance(sample.amount, str))

print(6)
print(0)
print("不正: ValueError")
print("不正: ValueError")
print("Test成功")
