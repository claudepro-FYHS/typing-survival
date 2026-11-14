/* =====================================================================
 *  打字求生 Typing Survival — 句子與專科題庫 (lines for the typing test)
 *  sentence: every grade.  excel: 高一.  c: 高二.
 *  Plain keyboard characters only (straight quotes), at most 46 characters,
 *  one space between words. tests/engine.test.js checks every line.
 * ===================================================================== */
(function (root) {
  const sentence = `
The quick brown fox jumps over the lazy dog.
My sister reads a book before bed.
We went to the beach on Sunday morning.
Please close the door when you leave.
How many apples are in the basket?
I have two cats, one dog and a fish.
The bus arrives at 7:30 every morning.
Can you help me carry this box?
Our class has 42 students this year.
She likes tea, but he likes coffee.
Turn off the lights to save energy.
The library opens at 8 and closes at 5.
Wash your hands before you eat.
It rained all day, so we stayed home.
Where did you put my blue pencil?
Malaysia has 13 states and 3 territories.
A week has 7 days and a year has 12 months.
Kuala Lumpur is the capital of Malaysia.
Johor Bahru is in the south of Malaysia.
Practice makes perfect, so keep typing.
Save your work before you shut down.
Always back up your important files.
Never share your password with anyone.
Press Ctrl and S to save the file.
The Internet connects computers worldwide.
A keyboard has letters, numbers and symbols.
Keep your back straight when you type.
Use all ten fingers, not just two.
Look at the screen, not at the keys.
Slow and steady wins the race.
Thank you for helping me yesterday.
What time does the movie start tonight?
My father drives to work at 6:45.
We planted 20 trees behind the school.
The test starts at 10 and ends at 11.
Reading every day improves your English.
Is this your bag, or is it mine?
Open the window, it is very hot today.
There are 60 minutes in one hour.
I finished my homework before dinner.
The teacher asked us to work in pairs.
Our team won the match by 3 goals.
Mix red and yellow to make orange.
Water boils at 100 degrees Celsius.
The Earth goes around the Sun once a year.
An email needs a clear subject line.
Check your spelling before you send it.
Good typing saves a lot of time.
Hello, my name is Alex. What is yours?
Bring an umbrella, it may rain later.
`;
  const excel = `
=SUM(A1:A10)
=AVERAGE(B2:B31)
=MAX(C2:C40)-MIN(C2:C40)
=COUNT(A:A)
=COUNTIF(D2:D31,">=60")
=IF(B2>=60,"Pass","Fail")
=IF(C5>90,"A",IF(C5>80,"B","C"))
=ROUND(E2*1.06,2)
=VLOOKUP(A2,Sheet2!A:C,3,FALSE)
=SUMIF(B:B,"Food",C:C)
=A1+B1*C1
=(A2+B2+C2)/3
=RANK(F2,$F$2:$F$31)
=TODAY()-B2
=LEN(A2)
=LEFT(A2,3)&"-"&RIGHT(A2,2)
=UPPER(B2)
=IFERROR(A2/B2,0)
=COUNTA(A2:A50)
=AND(B2>=50,C2>=50)
=OR(D2="Yes",E2="Yes")
=SUM(B2:B13)/12
=B2*$D$1
=MID(A2,4,2)
=AVERAGEIF(C:C,"J2",D:D)
=ROUNDUP(F2/7,0)
=MONTH(A2)&"/"&YEAR(A2)
=IF(AND(B2>0,C2>0),B2/C2,"")
=HLOOKUP(B1,A5:F8,2,FALSE)
=TEXT(A2,"dd/mm/yyyy")
=INDEX(B2:B20,MATCH(E1,A2:A20,0))
=COUNTIF(B2:B31,"<50")/30
=SUM(C2:C10)*0.1
=MIN(B2:B10)+MAX(B2:B10)
=IF(D2="","Missing",D2)
=A2&" "&B2
=ABS(B2-C2)
=TRIM(A2)
=B2/SUM($B$2:$B$9)
=NOW()
`;
  const c = `
#include <stdio.h>
int main() {
return 0;
int a, b, sum;
float average = 0.0;
char grade = 'A';
printf("Hello, World!\\n");
printf("%d\\n", x);
printf("Sum = %d\\n", a + b);
printf("%.2f\\n", average);
scanf("%d", &n);
scanf("%d %d", &a, &b);
sum = a + b;
average = (float)sum / n;
if (x > 0) {
} else if (x == 0) {
} else {
if (a >= 60 && a <= 100) {
if (n % 2 == 0) {
for (i = 0; i < 10; i++) {
for (i = 1; i <= n; i++) {
for (j = n; j > 0; j--) {
while (count < 5) {
while (n != 0) {
do {
} while (x != -1);
count++;
total += score[i];
i = i + 2;
int score[5] = {90, 85, 70, 60, 95};
int max = score[0];
if (score[i] > max) max = score[i];
char name[20];
printf("Enter your name: ");
scanf("%s", name);
switch (choice) {
case 1: printf("One\\n"); break;
default: printf("Other\\n");
int add(int x, int y) {
return x + y;
result = add(3, 4);
void show(int n) {
#define SIZE 10
int temp = a; a = b; b = temp;
x = (a > b) ? a : b;
printf("%d x %d = %d\\n", i, j, i * j);
if (ch == 'y' || ch == 'Y') {
n = n / 10;
digit = n % 10;
break;
continue;
int i, j, count = 0;
float price = 12.50;
printf("Total: %d\\n", total);
`;
  const clean = (s) => s.split("\n").map((x) => x.trim()).filter(String);
  const API = { sentence: clean(sentence), excel: clean(excel), c: clean(c), subjectOf: (grade) => (grade === "S1" ? "excel" : grade === "S2" ? "c" : "") };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.TS_LINES = API;
})(typeof window !== "undefined" ? window : globalThis);
