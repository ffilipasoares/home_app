"""Python port of app/src/lib/merchant.ts's normalizeMerchant. Category
rules are keyed on this value, so a merchant confirmed on a CSV-imported
transaction must normalize to the same key when it later arrives through
the bank sync. Keep the two implementations identical.
"""

import re
import unicodedata


def normalize_merchant(raw: str) -> str:
    s = unicodedata.normalize("NFD", raw.upper())
    s = "".join(c for c in s if not 0x300 <= ord(c) <= 0x36F)  # strip accents
    s = re.sub(r"[0-9]+", " ", s)  # drop card/store/reference numbers
    s = re.sub(r"[^A-Z& ]+", " ", s)  # drop punctuation
    return re.sub(r"\s+", " ", s).strip()
