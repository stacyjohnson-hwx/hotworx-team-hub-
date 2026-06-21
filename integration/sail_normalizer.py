"""
SAIL export normalizer — turns any messy SAIL POS export into a clean DataFrame.

SAIL's exports share several quirks (see HOTWORX_Integration_Handoff.md §3); this
module handles all of them in one place so every downstream job gets clean data:

  1. Row 0 is a title row ("Exported data"). Real headers are on row 1, data on row 2.
  2. Some exports (Monthly Campaigns, sometimes Members) have a blank leading column,
     so the header row has one fewer non-null cell than the data has columns.
  3. Files named .csv may actually be .xlsx (zip magic bytes "PK\\x03\\x04").

Usage:
    from sail_normalizer import normalize
    df = normalize("Sales by customer and employee.xlsx")
"""
import io
import pandas as pd


def _sniff(path):
    with open(path, "rb") as fh:
        sig = fh.read(8)
    if sig[:4] == b"PK\x03\x04":
        return "xlsx"
    if sig[:2] == b"\xd0\xcf":
        return "xls"
    return "csv"


def _read_raw(path):
    """Read the file with NO header inference, regardless of its real format."""
    kind = _sniff(path)
    if kind == "xlsx":
        return pd.read_excel(path, header=None, dtype=object, engine="openpyxl")
    if kind == "xls":
        return pd.read_excel(path, header=None, dtype=object)
    # CSV (best-effort)
    return pd.read_csv(path, header=None, dtype=object)


def normalize(path, header_row=1, data_row=2):
    """
    Return a clean DataFrame: title row dropped, headers from `header_row`,
    data from `data_row`, leading-blank-column shift corrected.
    """
    raw = _read_raw(path)
    headers = [h for h in raw.iloc[header_row].tolist() if pd.notna(h)]
    data = raw.iloc[data_row:].reset_index(drop=True)

    # Correct the leading-blank-column shift: if the data is wider than the header
    # list, the real columns are offset one (or more) to the right.
    if data.shape[1] > len(headers):
        offset = data.shape[1] - len(headers)
        data = data.iloc[:, offset:offset + len(headers)]
    else:
        data = data.iloc[:, :len(headers)]

    data.columns = headers
    # Drop fully-empty trailing rows SAIL sometimes appends.
    data = data.dropna(how="all").reset_index(drop=True)
    return data


def money(series):
    """Parse a money-ish column ('$1,234.56') into floats; blanks -> 0."""
    return (
        pd.to_numeric(
            series.astype(str).str.replace(r"[\$,]", "", regex=True).str.strip(),
            errors="coerce",
        ).fillna(0)
    )


def email_key(series):
    """Normalized email for cross-world joins: trimmed + lowercased."""
    return series.astype(str).str.strip().str.lower()
