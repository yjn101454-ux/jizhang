# -*- coding: utf-8 -*-
"""一个跑在终端里的极简记账工具。

只用 Python 自带的功能（json + datetime），不需要安装任何东西。
运行方式：在本文件所在目录打开终端，输入  python jizhang.py
"""

import json
import os
from datetime import datetime

# 账本数据存在这个文件里。第一次记账时程序会自动创建它，你不用手动建。
# 用 __file__ 拼出绝对路径，保证无论从哪个目录运行，data.json 都和脚本放在一起。
DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.json")


def load():
    """读取账本，返回一个列表（每个元素是一笔消费）。"""
    # 文件还不存在（比如第一次用），就返回空列表。
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError):
        # 文件内容坏了（比如被手动改乱了），提示一下并当作空账本，避免程序直接崩溃。
        print("⚠️  data.json 内容无法读取，已忽略原有数据。")
        return []


def save(records):
    """把账本列表写回文件。"""
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        # ensure_ascii=False 让中文原样显示；indent=2 让文件排版整齐、人眼好读。
        json.dump(records, f, ensure_ascii=False, indent=2)


def add_record(records):
    """功能①：记一笔消费。"""
    print("\n—— 记一笔 ——")

    # 反复询问金额，直到输入的是有效数字为止。
    while True:
        amount_text = input("金额（元）：").strip()
        try:
            amount = float(amount_text)
        except ValueError:
            print("  ✗ 这不是一个有效的数字，请重新输入。")
            continue
        if amount <= 0:
            print("  ✗ 金额要大于 0，请重新输入。")
            continue
        break

    category = input("分类（如 餐饮/交通/购物）：").strip()
    if not category:
        category = "未分类"  # 没填分类就归到「未分类」。

    note = input("备注（可选，直接回车跳过）：").strip()

    # 自动记录当前时间，你不用手动输。
    record = {
        "amount": amount,
        "category": category,
        "note": note,
        "time": datetime.now().strftime("%Y-%m-%d %H:%M"),
    }

    records.append(record)
    save(records)
    print("✓ 记账成功！")


def list_records(records):
    """功能②：列出所有消费。"""
    print("\n—— 全部消费记录 ——")
    if not records:
        print("还没有任何消费记录。")
        return

    for i, r in enumerate(records, start=1):
        note = r["note"] if r["note"] else "（无备注）"
        print(f"{i}. {r['time']}  {r['amount']:.2f} 元  [{r['category']}]  {note}")


def show_total(records):
    """功能③：算出总共花了多少钱，并按分类分别汇总。"""
    print("\n—— 消费总额 ——")
    if not records:
        print("还没有任何消费记录。")
        return

    total = sum(r["amount"] for r in records)
    print(f"总共花了：{total:.2f} 元（共 {len(records)} 笔）")

    # 顺手按分类汇总：把每个分类的金额累加到一个字典里。
    by_category = {}
    for r in records:
        by_category[r["category"]] = by_category.get(r["category"], 0) + r["amount"]

    print("\n按分类：")
    # 按金额从高到低排序，花得多的排在前面。
    for category, amount in sorted(by_category.items(), key=lambda x: x[1], reverse=True):
        print(f"  {category}：{amount:.2f} 元")


def main():
    """菜单循环：显示菜单，根据输入调用对应功能。"""
    records = load()

    while True:
        print("\n=========== 记账小工具 ===========")
        print("1. 记一笔")
        print("2. 查看全部记录")
        print("3. 查看总额")
        print("4. 退出")
        print("==================================")

        choice = input("请输入数字选择功能：").strip()

        if choice == "1":
            add_record(records)
        elif choice == "2":
            list_records(records)
        elif choice == "3":
            show_total(records)
        elif choice == "4":
            print("再见！👋")
            break
        else:
            print("✗ 没有这个选项，请输入 1 / 2 / 3 / 4。")


if __name__ == "__main__":
    main()
