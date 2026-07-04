window.BENCHMARK_DATA = {
  "lastUpdate": 1783175615134,
  "repoUrl": "https://github.com/hotsauce-team/hotsauce",
  "entries": {
    "hotsauce-cms benchmarks": [
      {
        "commit": {
          "author": {
            "email": "15802017+earthlingdavey@users.noreply.github.com",
            "name": "earthlingdavey",
            "username": "earthlingdavey"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "44a8cbf0a0a612ac2383e92c758679027d4a9efa",
          "message": "Merge pull request #95 from hotsauce-team/bench-ci\n\nfeat: land benchmark CI + docs on main (re-target of #93/#94)",
          "timestamp": "2026-07-04T15:30:13+01:00",
          "tree_id": "d3bc62faca264fa938e28acc54e908191099c11e",
          "url": "https://github.com/hotsauce-team/hotsauce/commit/44a8cbf0a0a612ac2383e92c758679027d4a9efa"
        },
        "date": 1783175614839,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "auth / signJwt (HS256)",
            "value": 65695,
            "unit": "ns/iter",
            "extra": "p75: 66308 ns, p99: 108330 ns, n: 7620"
          },
          {
            "name": "auth / verifyJwt (HS256)",
            "value": 73379,
            "unit": "ns/iter",
            "extra": "p75: 77505 ns, p99: 114449 ns, n: 6825"
          },
          {
            "name": "auth / createJwtPayload",
            "value": 75.17664659763315,
            "unit": "ns/iter",
            "extra": "p75: 74.2575 ns, p99: 97.0602 ns, n: 676"
          },
          {
            "name": "auth / getTokenFromCookies: 3-cookie header",
            "value": 766.5411146666668,
            "unit": "ns/iter",
            "extra": "p75: 753.8413 ns, p99: 1614.6735 ns, n: 75"
          },
          {
            "name": "auth / createAuthCookie",
            "value": 228.15691217391293,
            "unit": "ns/iter",
            "extra": "p75: 229.4485 ns, p99: 258.4433 ns, n: 230"
          },
          {
            "name": "cms / e2e: GET /admin — dashboard",
            "value": 129212,
            "unit": "ns/iter",
            "extra": "p75: 120818 ns, p99: 461902 ns, n: 3878"
          },
          {
            "name": "cms / e2e: GET /admin/posts/1 — detail page",
            "value": 448591,
            "unit": "ns/iter",
            "extra": "p75: 452257 ns, p99: 1037301 ns, n: 1125"
          },
          {
            "name": "cms / e2e: GET /admin/posts/1/edit — edit form",
            "value": 593359,
            "unit": "ns/iter",
            "extra": "p75: 590672 ns, p99: 1312206 ns, n: 854"
          },
          {
            "name": "cms / e2e: GET /admin/posts — list with JWT auth + row/column policies",
            "value": 1226132,
            "unit": "ns/iter",
            "extra": "p75: 1206641 ns, p99: 2008975 ns, n: 418"
          },
          {
            "name": "cms / e2e: POST /admin/posts/new — create (form submit)",
            "value": 898928,
            "unit": "ns/iter",
            "extra": "p75: 924104 ns, p99: 1954284 ns, n: 401"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/users — list page (25-row table)",
            "value": 643423,
            "unit": "ns/iter",
            "extra": "p75: 637080 ns, p99: 1356612 ns, n: 787"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/posts — default page of 25 (1,000-row table)",
            "value": 795919,
            "unit": "ns/iter",
            "extra": "p75: 780712 ns, p99: 1470469 ns, n: 642"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/posts?limit=100 — page of 100 (1,000-row table)",
            "value": 1563407,
            "unit": "ns/iter",
            "extra": "p75: 1559922 ns, p99: 2089233 ns, n: 330"
          },
          {
            "name": "cms / buildPolicyWhere: pk check + policy condition",
            "value": 1665.5810350000004,
            "unit": "ns/iter",
            "extra": "p75: 1563.2658 ns, p99: 3123.382 ns, n: 40"
          },
          {
            "name": "cms / createPolicyContext",
            "value": 5.719350514168152,
            "unit": "ns/iter",
            "extra": "p75: 5.4891 ns, p99: 12.4453 ns, n: 8752"
          },
          {
            "name": "cms / column filtering / filterRecordsColumns: 100 rows",
            "value": 52637,
            "unit": "ns/iter",
            "extra": "p75: 51005 ns, p99: 117013 ns, n: 9509"
          },
          {
            "name": "cms / column filtering / filterRecordsColumns: 1,000 rows",
            "value": 541802,
            "unit": "ns/iter",
            "extra": "p75: 524254 ns, p99: 1206260 ns, n: 933"
          },
          {
            "name": "cms / parseRoute: list URL",
            "value": 330.54495679012336,
            "unit": "ns/iter",
            "extra": "p75: 330.1572 ns, p99: 419.8215 ns, n: 162"
          },
          {
            "name": "cms / parseRoute: detail URL",
            "value": 397.30481470588256,
            "unit": "ns/iter",
            "extra": "p75: 395.9963 ns, p99: 604.1855 ns, n: 136"
          },
          {
            "name": "cms / parseRoute: edit URL",
            "value": 482.0556701754386,
            "unit": "ns/iter",
            "extra": "p75: 481.7399 ns, p99: 554.7596 ns, n: 114"
          },
          {
            "name": "cms / parseRoute: unknown table (404)",
            "value": 313.3280788235292,
            "unit": "ns/iter",
            "extra": "p75: 315.0389 ns, p99: 323.9421 ns, n: 170"
          },
          {
            "name": "cms / resolveAction: GET list",
            "value": 17.676804543853507,
            "unit": "ns/iter",
            "extra": "p75: 17.8073 ns, p99: 18.8257 ns, n: 2839"
          },
          {
            "name": "cms / matchPluginRoute: 20 routes, match last",
            "value": 4681.579095238095,
            "unit": "ns/iter",
            "extra": "p75: 4647.1375 ns, p99: 5415.2699 ns, n: 21"
          },
          {
            "name": "core / introspectFullSchema: blog schema (6 tables + relations)",
            "value": 27134,
            "unit": "ns/iter",
            "extra": "p75: 24857 ns, p99: 59478 ns, n: 18443"
          },
          {
            "name": "core / introspectTable: single table",
            "value": 1559.0916547619047,
            "unit": "ns/iter",
            "extra": "p75: 1553.0407 ns, p99: 1794.2996 ns, n: 42"
          },
          {
            "name": "core / mapColumnsToFields: single table",
            "value": 5731.956852631579,
            "unit": "ns/iter",
            "extra": "p75: 5724.8214 ns, p99: 5905.463 ns, n: 19"
          },
          {
            "name": "ui / escapeHtml: 60-char mixed string",
            "value": 814.4551416666669,
            "unit": "ns/iter",
            "extra": "p75: 807.147 ns, p99: 1211.763 ns, n: 72"
          },
          {
            "name": "ui / html tagged template: small fragment",
            "value": 1387.2923326086955,
            "unit": "ns/iter",
            "extra": "p75: 1386.5429 ns, p99: 1479.6289 ns, n: 46"
          },
          {
            "name": "ui / gridItems: 100 thumbnails",
            "value": 628613,
            "unit": "ns/iter",
            "extra": "p75: 612524 ns, p99: 1093053 ns, n: 806"
          },
          {
            "name": "ui / list view render / listTable: 25 rows × 5 columns",
            "value": 148619,
            "unit": "ns/iter",
            "extra": "p75: 143231 ns, p99: 265602 ns, n: 3374"
          },
          {
            "name": "ui / list view render / listTable: 100 rows × 5 columns",
            "value": 582435,
            "unit": "ns/iter",
            "extra": "p75: 568999 ns, p99: 1039844 ns, n: 869"
          },
          {
            "name": "ui / list view render / listTable: 1,000 rows × 5 columns",
            "value": 6057207,
            "unit": "ns/iter",
            "extra": "p75: 5932413 ns, p99: 10912753 ns, n: 93"
          }
        ]
      }
    ]
  }
}