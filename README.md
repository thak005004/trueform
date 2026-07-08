# TrueForm: W-2 Extraction and Review

**Live:** https://trueform-w2.vercel.app · **Repo:** https://github.com/thak005004/trueform

A W-2 is the form that reports how much someone earned in a year and how much tax was taken out. TrueForm reads a W-2, turns it into clean data, and double-checks that data so a tax preparer can trust it before typing it into tax software.

## The idea

An AI vision model can read the numbers off a W-2 in seconds. The problem is it sometimes reads one wrong, and it never tells you which one. It sounds just as sure when it's wrong as when it's right.

So TrueForm doesn't take the model's word for it. It checks the numbers against things that don't depend on the model being right:

- Does the tax math on the form actually add up?
- Does a second, separate read of the document agree?
- Do the client's forms make sense together, and next to last year's?

Anything that doesn't check out gets flagged for a person to look at. The point is to let a preparer clear a stack of forms quickly by checking only the few things that really need it, instead of re-reading every box by hand.

## What it does

**Reads any W-2.** A clean PDF, a scan, or a photo from a phone. It pulls every box into structured data.

**Checks the tax math.** The numbers on a W-2 have to line up in set ways. For example, the Social Security tax box should equal 6.2% of the Social Security wages box. TrueForm knows these rules and flags anything that doesn't add up, even when the model was sure it read the number right.

**Knows what's normal.** Some boxes are supposed to differ. If you put money into a 401(k), your taxable pay comes out lower than your total pay, and that is correct. TrueForm recognizes cases like this and stays quiet instead of raising a false alarm. A tool that flags normal forms just trains you to ignore it.

**Reads the important fields twice.** For the ID numbers (Social Security number, employer ID) and the main dollar amounts, TrueForm does a second, separate read of that exact spot on the page and checks that the model's number actually appears there. If the two reads disagree, it flags the field. Two readers disagreeing is real evidence of a problem, unlike a model just saying it feels confident.

**Warns when a scan is bad.** If that second read struggles to make out the key fields, TrueForm tells you the image is rough and points you at the name and address, which the math can't check and which are the first things to go wrong on a blurry scan.

**Compares to last year.** Load two years for the same person and it flags a big jump in pay, a change in how much tax was withheld, or a different employer. Those are mistakes a single form can't reveal on its own.

**Handles a whole client at once.** Drop in several W-2s as one packet and it totals them up and checks them against each other. For example, it catches the same Social Security number showing up under two different names, which usually means a form landed in the wrong client's folder.

**Explains the codes.** One box on a W-2 (Box 12) uses letter codes, like "D" for a 401(k). TrueForm spells out what each code means, and if it sees a code that isn't a real one, it flags it as a likely misread.

**Shows where every number came from.** Click any field and it highlights the exact spot on the document. You can edit anything, and the checks update instantly.

**Exports the data.** As a spreadsheet (CSV), as JSON, in the government's official e-file format for wages, and as a simple guide showing which tax-return line each box feeds into. It exports your corrections, not the raw read.

## Built with

Next.js and TypeScript, hosted on Vercel. The reading is done by Anthropic's vision model. A separate open-source tool (Tesseract) does the independent second read. PDFs are turned into images right in the browser. There is no database: a client's data stays in your browser tab, survives a refresh, and disappears when you close the tab, so sensitive information doesn't linger anywhere.

For how the pieces fit together, see [ARCHITECTURE.md](ARCHITECTURE.md): a data-flow diagram of the full pipeline and the trust-boundary design.

## Run it locally

```bash
git clone https://github.com/thak005004/trueform.git
cd trueform
npm install
echo "ANTHROPIC_API_KEY=your-key-here" > .env.local
npm run dev          # http://localhost:3000
```

```bash
npm test
npm run typecheck
```

## Try it

No W-2 handy? The homepage has sample forms you can open in one click. Each one shows off a different check:

- **Clean W-2** passes everything.
- **Box 4 error** has two digits swapped, and the math catches it.
- **High earner** is missing the extra Medicare tax that kicks in over $200k, also caught.
- **Roth 401(k)** is a case where two boxes are meant to match, and TrueForm correctly leaves it alone.
- **Multi-state** is someone who worked in two states.
- **Messy scan** is a rough photo that trips the low-quality warning.

There is also a two-year packet that shows the year-over-year comparison.

I also ran it on real sample W-2s I didn't make (from ADP, the IRS, and a university payroll office). It read the ADP form perfectly. On a busier, messier one it got every dollar amount right but made two smaller mistakes: it misread the employer's ID number, which the checks caught, and it mixed up two of the boxes, which the checks did not. That is the honest result, and it is why the tool is built around checking rather than trusting the read.
