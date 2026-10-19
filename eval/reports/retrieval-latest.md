# Retrieval-only comparison (k=6)

## golden set (36 questions)

| Mode | Doc Recall@6 | Doc MRR | Chunk Recall@1 | Chunk Recall@3 | Chunk Recall@6 | Chunk MRR |
| --- | --- | --- | --- | --- | --- | --- |
| vector | 100 % | 1.000 | 77 % | 100 % | 100 % | 0.878 |
| hybrid | 100 % | 1.000 | 77 % | 100 % | 100 % | 0.878 |

Chunk rank differences / misses (vector → hybrid):

- q02 "Who do I have to notify if I am sick, and when?": 1 → 2
- q04 "How many days per week can I work remotely?": 2 → 1
- q07 "What is the maximum hotel price per night in Germany on a business trip?": 1 → 2
- q11 "Wie hoch ist der Sonntagszuschlag?": 2 → 1
- q14 "Ab wie vielen Stunden Abwesenheit gibt es eine Verpflegungspauschale und wie hoch ist sie?": 1 → 2
- q19 "From how many hours per week does overtime start?": 1 → 2
- q20 "From how many hours per week does overtime start?": 2 → 1
- q24 "If a public holiday falls on a Sunday and I work during the day, what allowance do I get?": 2 → 1

## keyword stress set (exact policy terms)

| Mode | Doc Recall@6 | Doc MRR | Chunk Recall@1 | Chunk Recall@3 | Chunk Recall@6 | Chunk MRR |
| --- | --- | --- | --- | --- | --- | --- |
| vector | 100 % | 0.975 | 90 % | 95 % | 95 % | 0.925 |
| hybrid | 100 % | 0.967 | 90 % | 95 % | 95 % | 0.917 |

Chunk rank differences / misses (vector → hybrid):

- s05 "Verpflegungsmehraufwand": miss → miss
- s19 "Betriebsrat Kontakt": 2 → 3


## Threshold sweep (hybrid): error rates for the "found" decision

| max distance | min RRF | false refusals | false answers | accuracy |
| --- | --- | --- | --- | --- |
| 0.26 | 0 | 50 % | 0 % | 58 % |
| 0.26 | 0.02 | 50 % | 0 % | 58 % |
| 0.28 | 0 | 27 % | 0 % | 78 % |
| 0.28 | 0.02 | 27 % | 0 % | 78 % |
| 0.3 | 0 | 7 % | 0 % | 94 % |
| 0.3 | 0.02 | 7 % | 0 % | 94 % |
| 0.32 | 0 | 0 % | 17 % | 97 % |
| 0.32 | 0.02 | 0 % | 17 % | 97 % |
| 0.33 | 0 | 0 % | 17 % | 97 % |
| 0.33 | 0.02 | 0 % | 17 % | 97 % |
| 0.34 | 0 | 0 % | 33 % | 94 % |
| 0.34 | 0.02 | 0 % | 33 % | 94 % |
| 0.36 | 0 | 0 % | 50 % | 92 % |
| 0.36 | 0.02 | 0 % | 50 % | 92 % |
| 0.4 | 0 | 0 % | 50 % | 92 % |
| 0.4 | 0.02 | 0 % | 50 % | 92 % |
| 0.45 | 0 | 0 % | 83 % | 86 % |
| 0.45 | 0.02 | 0 % | 67 % | 89 % |

Best accuracy 97 % for max distance in [0.32, 0.33] → suggested MAX_VECTOR_DISTANCE=0.33

Best vector distance: answerable 0.222 – 0.311, unanswerable 0.305 – 0.461
