window.BENCHMARK_DATA = {
  "lastUpdate": 1783323852144,
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
      },
      {
        "commit": {
          "author": {
            "name": "earthlingdavey",
            "username": "earthlingdavey",
            "email": "15802017+earthlingdavey@users.noreply.github.com"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "44a8cbf0a0a612ac2383e92c758679027d4a9efa",
          "message": "Merge pull request #95 from hotsauce-team/bench-ci\n\nfeat: land benchmark CI + docs on main (re-target of #93/#94)",
          "timestamp": "2026-07-04T14:30:13Z",
          "url": "https://github.com/hotsauce-team/hotsauce/commit/44a8cbf0a0a612ac2383e92c758679027d4a9efa"
        },
        "date": 1783323851269,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "auth / signJwt (HS256)",
            "value": 78726,
            "unit": "ns/iter",
            "extra": "p75: 94146 ns, p99: 145663 ns, n: 6360"
          },
          {
            "name": "auth / verifyJwt (HS256)",
            "value": 88202,
            "unit": "ns/iter",
            "extra": "p75: 88476 ns, p99: 139652 ns, n: 5678"
          },
          {
            "name": "auth / createJwtPayload",
            "value": 65.06295846153856,
            "unit": "ns/iter",
            "extra": "p75: 66.3883 ns, p99: 74.3552 ns, n: 780"
          },
          {
            "name": "auth / getTokenFromCookies: 3-cookie header",
            "value": 858.0711101449276,
            "unit": "ns/iter",
            "extra": "p75: 858.0174 ns, p99: 1312.5233 ns, n: 69"
          },
          {
            "name": "auth / createAuthCookie",
            "value": 231.408601321586,
            "unit": "ns/iter",
            "extra": "p75: 230.4955 ns, p99: 293.1117 ns, n: 227"
          },
          {
            "name": "cms / e2e: GET /admin — dashboard",
            "value": 175360,
            "unit": "ns/iter",
            "extra": "p75: 169377 ns, p99: 521687 ns, n: 2862"
          },
          {
            "name": "cms / e2e: GET /admin/posts/1 — detail page",
            "value": 521690,
            "unit": "ns/iter",
            "extra": "p75: 516366 ns, p99: 1043984 ns, n: 968"
          },
          {
            "name": "cms / e2e: GET /admin/posts/1/edit — edit form",
            "value": 654715,
            "unit": "ns/iter",
            "extra": "p75: 670325 ns, p99: 1234121 ns, n: 774"
          },
          {
            "name": "cms / e2e: GET /admin/posts — list with JWT auth + row/column policies",
            "value": 1288506,
            "unit": "ns/iter",
            "extra": "p75: 1278473 ns, p99: 1902472 ns, n: 398"
          },
          {
            "name": "cms / e2e: POST /admin/posts/new — create (form submit)",
            "value": 895843,
            "unit": "ns/iter",
            "extra": "p75: 935721 ns, p99: 2066811 ns, n: 410"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/users — list page (25-row table)",
            "value": 686809,
            "unit": "ns/iter",
            "extra": "p75: 658967 ns, p99: 1429803 ns, n: 737"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/posts — default page of 25 (1,000-row table)",
            "value": 854941,
            "unit": "ns/iter",
            "extra": "p75: 833691 ns, p99: 1393058 ns, n: 596"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/posts?limit=100 — page of 100 (1,000-row table)",
            "value": 1649974,
            "unit": "ns/iter",
            "extra": "p75: 1625153 ns, p99: 2951096 ns, n: 313"
          },
          {
            "name": "cms / buildPolicyWhere: pk check + policy condition",
            "value": 1672.9068549999997,
            "unit": "ns/iter",
            "extra": "p75: 1658.7946 ns, p99: 2526.8588 ns, n: 40"
          },
          {
            "name": "cms / createPolicyContext",
            "value": 5.347035786774895,
            "unit": "ns/iter",
            "extra": "p75: 5.2489 ns, p99: 7.6774 ns, n: 9361"
          },
          {
            "name": "cms / column filtering / filterRecordsColumns: 100 rows",
            "value": 53734,
            "unit": "ns/iter",
            "extra": "p75: 53631 ns, p99: 120986 ns, n: 9316"
          },
          {
            "name": "cms / column filtering / filterRecordsColumns: 1,000 rows",
            "value": 543756,
            "unit": "ns/iter",
            "extra": "p75: 544710 ns, p99: 1039917 ns, n: 929"
          },
          {
            "name": "cms / parseRoute: list URL",
            "value": 356.4532019999999,
            "unit": "ns/iter",
            "extra": "p75: 358.1115 ns, p99: 515.4581 ns, n: 150"
          },
          {
            "name": "cms / parseRoute: detail URL",
            "value": 425.83942578125004,
            "unit": "ns/iter",
            "extra": "p75: 440.5128 ns, p99: 553.9211 ns, n: 128"
          },
          {
            "name": "cms / parseRoute: edit URL",
            "value": 509.91569907407427,
            "unit": "ns/iter",
            "extra": "p75: 508.5702 ns, p99: 803.2839 ns, n: 108"
          },
          {
            "name": "cms / parseRoute: unknown table (404)",
            "value": 352.6379796052632,
            "unit": "ns/iter",
            "extra": "p75: 360.3266 ns, p99: 379.9483 ns, n: 152"
          },
          {
            "name": "cms / resolveAction: GET list",
            "value": 16.251301846452822,
            "unit": "ns/iter",
            "extra": "p75: 16.7085 ns, p99: 18.7582 ns, n: 3087"
          },
          {
            "name": "cms / matchPluginRoute: 20 routes, match last",
            "value": 5023,
            "unit": "ns/iter",
            "extra": "p75: 4868 ns, p99: 10338 ns, n: 99569"
          },
          {
            "name": "core / introspectFullSchema: blog schema (6 tables + relations)",
            "value": 27465,
            "unit": "ns/iter",
            "extra": "p75: 25428 ns, p99: 69551 ns, n: 18215"
          },
          {
            "name": "core / introspectTable: single table",
            "value": 1664.140655,
            "unit": "ns/iter",
            "extra": "p75: 1633.1064 ns, p99: 2155.2951 ns, n: 40"
          },
          {
            "name": "core / mapColumnsToFields: single table",
            "value": 5867.445794736843,
            "unit": "ns/iter",
            "extra": "p75: 5965.4273 ns, p99: 6272.9661 ns, n: 19"
          },
          {
            "name": "ui / escapeHtml: 60-char mixed string",
            "value": 941.8084437500002,
            "unit": "ns/iter",
            "extra": "p75: 950.2851 ns, p99: 996.6389 ns, n: 64"
          },
          {
            "name": "ui / html tagged template: small fragment",
            "value": 1620.0771073170731,
            "unit": "ns/iter",
            "extra": "p75: 1634.6984 ns, p99: 1913.0315 ns, n: 41"
          },
          {
            "name": "ui / gridItems: 100 thumbnails",
            "value": 639691,
            "unit": "ns/iter",
            "extra": "p75: 637624 ns, p99: 1242086 ns, n: 792"
          },
          {
            "name": "ui / list view render / listTable: 25 rows × 5 columns",
            "value": 157574,
            "unit": "ns/iter",
            "extra": "p75: 154018 ns, p99: 283911 ns, n: 3183"
          },
          {
            "name": "ui / list view render / listTable: 100 rows × 5 columns",
            "value": 615671,
            "unit": "ns/iter",
            "extra": "p75: 614351 ns, p99: 752629 ns, n: 822"
          },
          {
            "name": "ui / list view render / listTable: 1,000 rows × 5 columns",
            "value": 6369913,
            "unit": "ns/iter",
            "extra": "p75: 6266202 ns, p99: 10458861 ns, n: 89"
          }
        ]
      }
    ]
  }
}