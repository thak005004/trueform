# TrueForm: W-2 Extraction & Review

**Live:** https://trueform-w2.vercel.app · **Repo:** https://github.com/thak005004/trueform

Upload a client's W-2s and get clean, structured data you can check and fix before it goes into your tax software.

Built for the Grove take-home by Aditi Thakur.

---

## The idea

Any vision model can pull the numbers off a W-2. The harder question is whether you can trust them. The model doesn't know when it's wrong, and it reports the same confidence whether it read a number right or not.

TrueForm's approach is to verify the data against things that don't depend on the model's opinion: whether the tax math on the form actually works out, whether a second separate read of the document agrees, and whether a client's forms are consistent with each other. Anything that doesn't check out gets flagged for review. The goal is to let a preparer get through a stack of forms without having to re-read every box by hand.

## What it does

**Reads any W-2.** A clean PDF, a scan, or a photo someone took on their phone. It pulls every box into structured data.

**Checks the math.** A W-2 has to be internally consistent, and TrueForm knows the rules. Social Security tax should be 6.2% of the right wages. Medicare tax should be 1.45%, plus the extra 0.9% high earners owe over $200k. Social Security wages can't go past the year's cap. If a number doesn't add up it gets flagged, even when the model was sure it read it right.

**Knows what not to flag.** Box 1 and Box 5 often differ on a real W-2, usually because of pre-tax 401k money. TrueForm recognizes that and confirms it's fine instead of raising a false alarm. A tool that flags normal forms just teaches you to ignore it.

**Reads the high-value fields twice.** For the identity IDs (SSN, EIN) and the headline dollar boxes (1, 2, 16), TrueForm runs a separate OCR pass over that spot on the document and checks that the model's value actually appears there. When the second read can't confirm it, the field is flagged to check against the document. Two independent reads disagreeing is real, observable uncertainty, unlike a model just saying it's confident. (Names and addresses are deliberately left out of this check — see the writeup.)

**Shows its work.** Click any field and it highlights where that value came from on the document, so you can check it against the source at a glance. Every field is editable, and the flags update the moment you fix something.

**Handles a whole client, not one form.** Add several W-2s as one packet and it adds up the totals and checks them against each other. For example, it catches when the same Social Security number shows up under two different names, which usually means a form landed in the wrong client's folder. You can't see that one form at a time.

**Exports clean data** as JSON or CSV, organized by box number so it maps into tax software. It exports your corrections, not the raw read.

## Built with

Next.js and TypeScript, deployed on Vercel. Extraction runs through the Anthropic API. A separate open-source OCR pass (Tesseract) acts as the independent second reader. PDFs are turned into images in the browser. There's no database. A client's data lives only in your session, which keeps sensitive tax information from sticking around.

## Run it locally

```bash
git clone https://github.com/thak005004/trueform.git
cd trueform
npm install
echo "ANTHROPIC_API_KEY=your-key-here" > .env.local
npm run dev          # http://localhost:3000
```

```bash
npm test             # runs the math, reconciliation, and cross-check tests
npm run typecheck
```

## See the trust layer work

Upload a normal W-2 first. Then try one built to trip a check:

- a W-2 with two digits swapped in the Social Security tax box, and the math catches it
- a high earner missing the extra Medicare tax, also caught
- two W-2s sharing one Social Security number but different names, flagged as a likely mixed-up document

A short writeup covering the decisions, the tradeoffs, and how I used AI tools is submitted separately.
