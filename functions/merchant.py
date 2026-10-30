"""Python port of app/src/lib/merchant.ts's normalizeMerchant. Category
rules are keyed on this value, so a merchant confirmed on a transaction
added in the app must normalize to the same key when it later arrives
through the bank sync. Keep the two implementations identical.
"""

import re
import unicodedata


def normalize_merchant(raw: str) -> str:
    s = unicodedata.normalize("NFD", raw.upper())
    s = "".join(c for c in s if not 0x300 <= ord(c) <= 0x36F)  # strip accents
    # Drop card/store/reference numbers (4+ digits, "LIDL 4521"), keep the
    # short ones that are part of a name ("TRADING 212", "7-ELEVEN").
    s = re.sub(r"[0-9]{4,}", " ", s)
    s = re.sub(r"[^A-Z0-9& ]+", " ", s)  # drop punctuation
    return re.sub(r"\s+", " ", s).strip()
