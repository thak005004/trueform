# TrueForm: Tax Form Extraction and Review

**Live:** https://trueform-w2.vercel.app · **Repo:** https://github.com/thak005004/trueform

TrueForm reads a tax form, turns it into clean data, and checks that data so a tax preparer can trust it before typing it into tax software. It handles the common forms in depth (W-2 and 1099-NEC), extracts any other tax form it is given, and is always clear about which is which.

## The idea

An AI vision model can read the numbers off a tax form in seconds. The problem is it sometimes reads one wrong, and it never tells you which one. It sounds just as sure when it is wrong as when it is right.

So TrueForm does not take the model's word for it. It checks the numbers against things that do not depend on the model being right:

- Does the tax math on the form actually add up?
- Does a second, separate read of the document agree?
- Do the client's forms make sense together, and next to last year's?

Anything that does not check out gets flagged for a person to look at. And when TrueForm is handed a form it cannot check in depth, it says so plainly instead of pretending. The point is to let a preparer clear a stack of forms quickly by checking only the few things that really need it, instead of re-reading every box by hand.

## What it does

**Reads any tax form.** A clean PDF, a scan, or a photo from a phone. It figures out what the form is, pulls every field into structured data, and if it is handed something that is not a tax form at all, it sets it aside for a person rather than guessing.

**Verifies the forms it knows.** For a W-2 or a 1099-NEC, TrueForm runs that form's own tax math. For example, the Social Security tax box on a W-2 should equal 6.2% of the Social Security wages box. It flags anything that does not add up, even when the model was sure it read the number right.

**Extracts the rest, honestly.** For any other tax form (a 1098-T, say), TrueForm reads the fields and shows them, clearly marked as extracted but not machine-checked, so you know to give them a look. It never invents checks for a form it does not understand.

**Knows what is normal.** Some boxes are supposed to differ. If you put money into a 401(k), your taxable pay comes out lower than your total pay, and that is correct. TrueForm recognizes cases like this and stays quiet instead of raising a false alarm. A tool that flags normal forms just trains you to ignore it.

**Reads the important fields twice.** For the ID numbers and the main dollar amounts on the forms it verifies, TrueForm does a second, separate read of that exact spot on the page and checks that the model's number actually appears there. If the two reads disagree, it flags the field. This catches misreads without needing the form's tax math, so it works on any form whose fields it can locate reliably. Two readers disagreeing is real evidence of a problem, unlike a model just saying it feels confident.

**Warns when a scan is bad.** If that second read struggles to make out the key fields, TrueForm tells you the image is rough and points you at the name and address, which the math cannot check and which are the first things to go wrong on a blurry scan.

**Compares to last year.** Load two years for the same person and it flags a big jump in pay, a change in how much tax was withheld, or a different employer. Those are mistakes a single form cannot reveal on its own.

**Handles many forms at once.** Drop in a whole client's stack, one form or many. TrueForm works through them a few at a time so it does not overload or trip rate limits, retries anything that hits a snag, and shows the progress. It totals the W-2s and checks them against each other, catching things like the same Social Security number showing up under two different names, which usually means a form landed in the wrong client's folder.

**Explains the codes.** One box on a W-2 (Box 12) uses letter codes, like "D" for a 401(k). TrueForm spells out what each code means, and if it sees a code that is not a real one, it flags it as a likely misread.

**Shows where every number came from.** Click any field and it highlights the spot on the document. You can edit anything, and the checks update instantly.

**Exports the data.** As a spreadsheet (CSV), as JSON, in the government's official e-file format for wages, and as a simple guide showing which tax-return line each box feeds into. It exports your corrections, not the raw read.

## How it grows to more forms

TrueForm treats a tax form as a definition it reads at runtime, not as code baked into the tool. A definition lists the form's fields, its checks, and where each field maps downstream. W-2 and 1099-NEC are the first two definitions, and the engine that extracts and validates knows nothing specific about either one; it just reads the definition. Adding another form is writing a new definition, not changing the engine, which is what lets the same tool grow from two forms to many without a rewrite.

Encoding a form's checks is domain work, because it means knowing that form's real rules. So the natural next step is a tax expert adding a form through config, or a model drafting a definition that a person verifies. Extraction generalizes for free; the tax rules per form are the part that takes a human who knows the form.

## Built with

Next.js and TypeScript, hosted on Vercel. The reading is done by Anthropic's vision model, through forced tool use against a strict schema. A cheap first pass identifies which form each upload is and routes it, and refuses anything that is not a tax form. A separate open-source tool (Tesseract) does the independent second read, so the two readers are genuinely different. PDFs are turned into images right in the browser. There is no database: a client's data stays in your browser tab, survives a refresh, and disappears when you close the tab, so sensitive information does not linger anywhere.

For how the pieces fit together, see [ARCHITECTURE.md](ARCHITECTURE.md).

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

No form handy? The homepage has sample forms you can open in one click. Each one shows off a different part of the tool:

- **Clean W-2** passes every check.
- **Box 4 error** has two digits swapped, and the math catches it.
- **High earner** is missing the extra Medicare tax that kicks in over $200k, also caught.
- **1099-NEC** is a second form that gets its own checks, to show the same engine handling a different form type.
- **1098-T** is a form TrueForm has no definition for; it extracts the fields and marks them unverified.
- **Multi-state** is someone who worked in two states.
- **Roth 401(k)** is a case where two boxes are meant to match, and TrueForm correctly leaves it alone.
- **Messy scan** is a rough photo that trips the low-quality warning.

There is also a two-year packet that shows the year-over-year comparison. To see the drop-anything behavior, upload a document that is not a tax form and watch it get set aside for review.

## Honest results

The forms above are samples. To test the real thing, I ran the extractor on real sample W-2s I did not make (from ADP, the IRS, and a university payroll office). It read the ADP form perfectly. On a busier, messier one it got every dollar amount right but made two smaller mistakes: it misread the employer's ID number, which the checks caught, and it mixed up two of the boxes, which the checks did not. That is the honest result, and it is why the tool is built around checking rather than trusting the read.

The same extraction now handles forms TrueForm has no definition for, like a 1098-T, on a best-effort basis. Those come out clearly marked as unverified, because without the form's own rules there is no tax math to check them against. The independent second read is the one verification that does not need those rules, and it runs wherever the field locations are reliable enough to trust.
