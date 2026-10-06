#!/usr/bin/env python3
"""Acceptance check for the Busleyden delivery: python3 check.py delivered.csv [after_filters removed_by_dedup output_rows]
Compares the delivered CSV (line endings normalised) with expected.csv row by row, and the three counts with 14 / 3 / 11."""
import csv, sys, os
here=os.path.dirname(os.path.abspath(__file__))
def rows(p):
    import io
    t=open(p,encoding="utf-8-sig").read().replace("\r\n","\n").replace("\r","\n")
    return list(csv.reader(io.StringIO(t)))
exp=rows(os.path.join(here,"expected.csv")); got=rows(sys.argv[1])
exp=[r for r in exp if r]; got=[r for r in got if r]
ok=True
if exp[0]!=got[0]: print("HEADER differs:", got[0], "expected", exp[0]); ok=False
five=[r for r in rows(os.path.join(here,"expected-5.csv")) if r][1:]
for r in five:
    if r not in got[1:]: print("MISSING expected row:", r); ok=False
if got[1:]!=exp[1:]:
    print("FULL output differs from expected.csv (%d rows delivered, %d expected)"%(len(got)-1,len(exp)-1)); ok=False
    for i,(a,b) in enumerate(zip(got[1:],exp[1:])):
        if a!=b: print("  row",i+1,"got",a,"expected",b); break
want=(14,3,11)
if len(sys.argv)>=5:
    have=tuple(int(x) for x in sys.argv[2:5])
    if have!=want: print("COUNTS differ: delivered", have, "expected", want); ok=False
    else: print("counts match", want)
else: print("counts not given; expected after_filters/removed_by_dedup/output =", want)
print("ACCEPT" if ok else "NOT ACCEPTED (five-row rule: %s)"%("met" if all(r in got[1:] for r in five) and exp[0]==got[0] else "not met"))
