# Generates db/seed_demo.sql (20 fictional students + demo records, all is_demo=1). python3 scripts/seed_demo.py
names = "Ayaan Ahmed,Ibrahim Hassan,Mohamed Ali,Ahmed Ismail,Abdullah Rasheed,Yusuf Ibrahim,Adam Mohamed,Ali Shifan,Hassan Zayan,Ismail Nihan,Aisha Ibrahim,Maryam Ahmed,Fathima Ali,Aminath Hassan,Hawwa Mohamed,Zaina Ismail,Safa Abdullah,Inaya Rasheed,Amina Shifan,Mariyam Zayan".split(",")
plan = [600,600,300,0,600,750,600,200,600,0,600,400,600,0,600,600,100,600,600,300]  # MVR paid: full/partial/unpaid/overpaid
L = ["-- DEMO DATA ONLY. Fictional. Remove from the admin screen (Admin → Remove demo data).", "UPDATE settings SET value='1' WHERE key='demo_mode';"]
for n in names: L.append(f"INSERT INTO students(name,expected,is_demo) VALUES('{n}',60000,1);")
k = 0
for i, mvr in enumerate(plan):
    if not mvr: continue
    parts = [mvr] if (mvr < 600 or i % 2 == 0) else [300, mvr - 300]
    for j, a in enumerate(parts):
        k += 1; m = 1 + (i + j * 3) % 9
        L.append(f"INSERT INTO payments(student_id,amount,paid_on,method,reference,idem_key,is_demo) VALUES({i+1},{a*100},'2026-{m:02d}-{10+i%15}','{'Cash' if i%2 else 'Bank transfer'}','DEMO-{k}','demo-pay-{k}',1);")
for n, (d, t, c, a) in enumerate([("2026-02-12","Classroom decorations","Classroom supplies",420),("2026-05-09","Teachers' Day gifts","Gifts",1350.5),("2026-06-20","Printing worksheets","Printing",180),("2026-09-15","Event snacks","Food",640)], 1):
    L.append(f"INSERT INTO expenses(spent_on,description,category,amount,idem_key,is_demo) VALUES('{d}','{t.replace(chr(39),chr(39)*2)}','{c}',{int(round(a*100))},'demo-exp-{n}',1);")
for t, d, v, b in [("Children's Day","2026-11-10","School hall",900),("Parent-teacher meeting","2026-11-25","Classroom",0),("End-of-year celebration","2026-12-15","TBC",1500),("Sports Day","2027-02-01","TBC",800)]:
    L.append(f"INSERT INTO events(title,event_date,venue,budget,status,description,is_demo) VALUES('{t.replace(chr(39),chr(39)*2)}','{d}','{v}',{b*100},'tentative','Placeholder date – confirm with school',1);")
open("db/seed_demo.sql", "w").write("\n".join(L) + "\n"); print("seed written")
