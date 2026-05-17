PDCA_SEQUENCE = ["PLAN", "DO", "CHECK", "ACT", "CLOSED"]


def next_pdca_phase(current):
    try:
        idx = PDCA_SEQUENCE.index(current)
    except ValueError:
        return None
    if idx + 1 >= len(PDCA_SEQUENCE):
        return None
    return PDCA_SEQUENCE[idx + 1]
