# TrueForm: W-2 Extraction and Review

**Live:** https://trueform-w2.vercel.app · **Repo:** https://github.com/thak005004/trueform

Upload a client's W-2s and get clean, structured data you can check and fix before it goes into your tax software.

Built for the Grove take-home by Aditi Thakur.

---

## The idea

Any vision model can pull the numbers off a W-2. The harder question is whether you can trust them. The model doesn't know when it's wrong, and it reports the same confidence whether it read a number right or not.

So TrueForm verifies the data against things that don't depend on the model's opinion: whether the tax math on the form actually works out, whether a separate second read of the document agrees, and whether a client's forms are consistent with each other and with last year. Anything that doesn't check out gets flagged. The goal is to let a preparer get through a stack of forms without re-reading every box by hand.

## What it does

**Reads any W-2.** A clean PDF, a scan, or a photo off someone's phone. It pulls every box into structured data using a fast vision model.

**Checks the math.** A W-2 has to be internally consistent, and TrueForm knows the rules. Social Security tax should be 6.2% of the right wages. Medicare tax should be 1.45%, plus the extra 0.9% high earners owe over $200k. Social Security wages can't go past the year's cap. If a number doesn't add up it gets flagged, even when the model was sure it read it right.

**Knows what not to flag.** Box 1 and Box 5 often differ on a real W-2, usually because of pre-tax 401(k) money. TrueForm recognizes that and confirms it's fine instead of raising a false alarm. A tool that flags normal forms just teaches you to ignore it.

**Reads the high-value fields twice.** For the identity IDs (SSN, EIN) and the headline dollar boxes, TrueForm runs a separate OCR pass over that spot on the document and checks that the model's value actually appears there. When the second read can't confirm it, the field is flagged to check against the source. Two independent reads disagreeing is real, observable uncertainty, not a model just saying it's confident.

**Warns when a scan is too rough.** If that second read struggles to confirm the key fields, TrueForm says so up front and points you at the text fields (name, address) that the tax math can't guard, which is exactly where a bad scan tends to go wrong quietly.

**Compares against last year.** Load two years for the same person and it flags a large wage swing, a jump in the withholding rate, or a changed employer. Those are the errors a single form's math can't see.

**Handles a whole client, not one form.** Add several W-2s as one packet and it adds up the totals and checks them against each other. It catches the same Social Security number showing up under two different names, which usually means a form landed in the wrong client's folder. You can't see that one form at a time.

**Reads Box 12.** It decodes the codes (D is a 401(k) deferral, DD is health coverage, and so on) so you see what they mean, and it flags a code that isn't a real one, which is a sign the model misread it.

**Shows its work.** Click any field and it highlights where that value came from on the document. Every field is editable, and the flags update the moment you fix something.

**Exports clean data.** JSON or CSV organized by box number, an EFW2 record (the SSA's fixed-width e-file layout for the employee and state wage records), and a plain-English map of each box to where it lands on the 1040. It exports your corrections, not the raw read.

## Built with

Next.js and TypeScript, deployed on Vercel. Extraction runs through the Anthropic API on a fast model (Haiku), which I picked after benchmarking: it matched the larger model box for box on my samples at about half the latency, and since the trust comes from the checks rather than the model, using the faster reader is safe. A separate open-source OCR pass (Tesseract) is the independent second reader. PDFs are turned into images in the browser. There's no database. A client's data lives only in your session, survives a page reload, and clears when you close the tab, so sensitive tax information doesn't stick around.

## Run it locally

```bash
git clone https://github.com/thak005004/trueform.git
cd trueform
npm install
echo "ANTHROPIC_API_KEY=your-key-here" > .env.local
npm run dev          # http://localhost:3000
```

```bash
npm test             # math, reconciliation, cross-check, EFW2, and helper tests
npm run typecheck
```

## See the trust layer work

No W-2 handy? The landing page has samples you can load in one click. Each one exercises a different check:

- **Clean W-2** passes every check.
- **Box 4 error** has two digits swapped in the Social Security tax box, and the math catches it.
- **High earner** is missing the extra Medicare tax over $200k, also caught.
- **Roth 401(k)** is post-tax, so Box 1 equals Box 5, and TrueForm correctly does not raise a deferral flag.
- **Multi-state** has two state rows.
- **Messy scan** is a rough photo that trips the low-confidence warning.

There's also a two-year packet that shows the prior-year comparison.

I also spot-checked the extractor on real, publicly posted sample W-2s I didn't create (from ADP, the IRS, and a university payroll office). The details are in the writeup, including what it got right and the one field it misread that the checks caught.

A short writeup covering the decisions, the tradeoffs, and how I used AI tools is submitted separately.
