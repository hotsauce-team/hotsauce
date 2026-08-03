window.BENCHMARK_DATA = {
  "lastUpdate": 1785741454752,
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
        "date": 1783927031912,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "auth / signJwt (HS256)",
            "value": 94592,
            "unit": "ns/iter",
            "extra": "p75: 100494 ns, p99: 165741 ns, n: 5294"
          },
          {
            "name": "auth / verifyJwt (HS256)",
            "value": 106283,
            "unit": "ns/iter",
            "extra": "p75: 114785 ns, p99: 158326 ns, n: 4715"
          },
          {
            "name": "auth / createJwtPayload",
            "value": 67.27629748010614,
            "unit": "ns/iter",
            "extra": "p75: 66.5895 ns, p99: 82.3209 ns, n: 754"
          },
          {
            "name": "auth / getTokenFromCookies: 3-cookie header",
            "value": 871.5424588235295,
            "unit": "ns/iter",
            "extra": "p75: 857.474 ns, p99: 1744.7458 ns, n: 68"
          },
          {
            "name": "auth / createAuthCookie",
            "value": 233.62849822222222,
            "unit": "ns/iter",
            "extra": "p75: 239.5641 ns, p99: 273.6499 ns, n: 225"
          },
          {
            "name": "cms / e2e: GET /admin — dashboard",
            "value": 170158,
            "unit": "ns/iter",
            "extra": "p75: 168435 ns, p99: 446796 ns, n: 2948"
          },
          {
            "name": "cms / e2e: GET /admin/posts/1 — detail page",
            "value": 498544,
            "unit": "ns/iter",
            "extra": "p75: 505355 ns, p99: 1050625 ns, n: 1012"
          },
          {
            "name": "cms / e2e: GET /admin/posts/1/edit — edit form",
            "value": 650066,
            "unit": "ns/iter",
            "extra": "p75: 642201 ns, p99: 1312615 ns, n: 779"
          },
          {
            "name": "cms / e2e: GET /admin/posts — list with JWT auth + row/column policies",
            "value": 1241289,
            "unit": "ns/iter",
            "extra": "p75: 1254046 ns, p99: 1948215 ns, n: 413"
          },
          {
            "name": "cms / e2e: POST /admin/posts/new — create (form submit)",
            "value": 993564,
            "unit": "ns/iter",
            "extra": "p75: 994330 ns, p99: 2437069 ns, n: 384"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/users — list page (25-row table)",
            "value": 652646,
            "unit": "ns/iter",
            "extra": "p75: 654434 ns, p99: 1257812 ns, n: 777"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/posts — default page of 25 (1,000-row table)",
            "value": 831648,
            "unit": "ns/iter",
            "extra": "p75: 810556 ns, p99: 1426197 ns, n: 611"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/posts?limit=100 — page of 100 (1,000-row table)",
            "value": 1647661,
            "unit": "ns/iter",
            "extra": "p75: 1624409 ns, p99: 2639839 ns, n: 314"
          },
          {
            "name": "cms / buildPolicyWhere: pk check + policy condition",
            "value": 1688.0497925000004,
            "unit": "ns/iter",
            "extra": "p75: 1625.9826 ns, p99: 3146.9565 ns, n: 40"
          },
          {
            "name": "cms / createPolicyContext",
            "value": 5.4598342386561765,
            "unit": "ns/iter",
            "extra": "p75: 5.2479 ns, p99: 8.8786 ns, n: 9168"
          },
          {
            "name": "cms / column filtering / filterRecordsColumns: 100 rows",
            "value": 54293,
            "unit": "ns/iter",
            "extra": "p75: 52268 ns, p99: 127979 ns, n: 9221"
          },
          {
            "name": "cms / column filtering / filterRecordsColumns: 1,000 rows",
            "value": 576096,
            "unit": "ns/iter",
            "extra": "p75: 538227 ns, p99: 1192601 ns, n: 878"
          },
          {
            "name": "cms / parseRoute: list URL",
            "value": 369.9861630136986,
            "unit": "ns/iter",
            "extra": "p75: 368.1386 ns, p99: 544.7771 ns, n: 146"
          },
          {
            "name": "cms / parseRoute: detail URL",
            "value": 470.2451836206896,
            "unit": "ns/iter",
            "extra": "p75: 468.817 ns, p99: 636.704 ns, n: 116"
          },
          {
            "name": "cms / parseRoute: edit URL",
            "value": 509.4047293577984,
            "unit": "ns/iter",
            "extra": "p75: 510.1814 ns, p99: 631.2218 ns, n: 109"
          },
          {
            "name": "cms / parseRoute: unknown table (404)",
            "value": 387.3512971223023,
            "unit": "ns/iter",
            "extra": "p75: 381.0518 ns, p99: 552.9784 ns, n: 139"
          },
          {
            "name": "cms / resolveAction: GET list",
            "value": 17.304358241379344,
            "unit": "ns/iter",
            "extra": "p75: 17.078 ns, p99: 20.6646 ns, n: 2900"
          },
          {
            "name": "cms / matchPluginRoute: 20 routes, match last",
            "value": 5242,
            "unit": "ns/iter",
            "extra": "p75: 5040 ns, p99: 11141 ns, n: 95415"
          },
          {
            "name": "core / introspectFullSchema: blog schema (6 tables + relations)",
            "value": 27592,
            "unit": "ns/iter",
            "extra": "p75: 25676 ns, p99: 67416 ns, n: 18131"
          },
          {
            "name": "core / introspectTable: single table",
            "value": 1598.446257142857,
            "unit": "ns/iter",
            "extra": "p75: 1601.8293 ns, p99: 1679.115 ns, n: 42"
          },
          {
            "name": "core / mapColumnsToFields: single table",
            "value": 6363.902177777778,
            "unit": "ns/iter",
            "extra": "p75: 6294.3434 ns, p99: 7231.5433 ns, n: 18"
          },
          {
            "name": "ui / escapeHtml: 60-char mixed string",
            "value": 1042.8759534482756,
            "unit": "ns/iter",
            "extra": "p75: 992.4143 ns, p99: 1707.9616 ns, n: 58"
          },
          {
            "name": "ui / html tagged template: small fragment",
            "value": 1697.0025200000005,
            "unit": "ns/iter",
            "extra": "p75: 1707.0309 ns, p99: 1726.327 ns, n: 40"
          },
          {
            "name": "ui / gridItems: 100 thumbnails",
            "value": 667337,
            "unit": "ns/iter",
            "extra": "p75: 649275 ns, p99: 1297718 ns, n: 759"
          },
          {
            "name": "ui / list view render / listTable: 25 rows × 5 columns",
            "value": 163003,
            "unit": "ns/iter",
            "extra": "p75: 158847 ns, p99: 310120 ns, n: 3077"
          },
          {
            "name": "ui / list view render / listTable: 100 rows × 5 columns",
            "value": 638698,
            "unit": "ns/iter",
            "extra": "p75: 620651 ns, p99: 1106449 ns, n: 793"
          },
          {
            "name": "ui / list view render / listTable: 1,000 rows × 5 columns",
            "value": 6626848,
            "unit": "ns/iter",
            "extra": "p75: 6542347 ns, p99: 10825058 ns, n: 85"
          }
        ]
      },
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
          "id": "b52d8cd3f7240db58a9e032367d0ff33de78441d",
          "message": "Merge pull request #97 from hotsauce-team/admin-no-store\n\nfeat(cms): send Cache-Control: no-store on admin and account screens",
          "timestamp": "2026-07-17T18:38:14+01:00",
          "tree_id": "c52eb57535920855fd15cded71110388e9ec50bc",
          "url": "https://github.com/hotsauce-team/hotsauce/commit/b52d8cd3f7240db58a9e032367d0ff33de78441d"
        },
        "date": 1784309934925,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "auth / signJwt (HS256)",
            "value": 62838,
            "unit": "ns/iter",
            "extra": "p75: 63544 ns, p99: 118589 ns, n: 7967"
          },
          {
            "name": "auth / verifyJwt (HS256)",
            "value": 71608,
            "unit": "ns/iter",
            "extra": "p75: 73068 ns, p99: 113467 ns, n: 6992"
          },
          {
            "name": "auth / createJwtPayload",
            "value": 75.50796151560168,
            "unit": "ns/iter",
            "extra": "p75: 74.4877 ns, p99: 98.0584 ns, n: 673"
          },
          {
            "name": "auth / getTokenFromCookies: 3-cookie header",
            "value": 799.5611027397262,
            "unit": "ns/iter",
            "extra": "p75: 794.7023 ns, p99: 1753.4993 ns, n: 73"
          },
          {
            "name": "auth / createAuthCookie",
            "value": 244.29566976744195,
            "unit": "ns/iter",
            "extra": "p75: 247.881 ns, p99: 281.9703 ns, n: 215"
          },
          {
            "name": "cms / e2e: GET /admin — dashboard",
            "value": 132931,
            "unit": "ns/iter",
            "extra": "p75: 123882 ns, p99: 447900 ns, n: 3770"
          },
          {
            "name": "cms / e2e: GET /admin/posts/1 — detail page",
            "value": 461328,
            "unit": "ns/iter",
            "extra": "p75: 468961 ns, p99: 1188180 ns, n: 1093"
          },
          {
            "name": "cms / e2e: GET /admin/posts/1/edit — edit form",
            "value": 606915,
            "unit": "ns/iter",
            "extra": "p75: 598090 ns, p99: 1369647 ns, n: 833"
          },
          {
            "name": "cms / e2e: GET /admin/posts — list with JWT auth + row/column policies",
            "value": 1195696,
            "unit": "ns/iter",
            "extra": "p75: 1186267 ns, p99: 2232638 ns, n: 430"
          },
          {
            "name": "cms / e2e: POST /admin/posts/new — create (form submit)",
            "value": 947941,
            "unit": "ns/iter",
            "extra": "p75: 966252 ns, p99: 2231476 ns, n: 379"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/users — list page (25-row table)",
            "value": 663574,
            "unit": "ns/iter",
            "extra": "p75: 645730 ns, p99: 1491515 ns, n: 764"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/posts — default page of 25 (1,000-row table)",
            "value": 805726,
            "unit": "ns/iter",
            "extra": "p75: 779658 ns, p99: 1635056 ns, n: 630"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/posts?limit=100 — page of 100 (1,000-row table)",
            "value": 1592655,
            "unit": "ns/iter",
            "extra": "p75: 1574587 ns, p99: 2610171 ns, n: 324"
          },
          {
            "name": "cms / buildPolicyWhere: pk check + policy condition",
            "value": 1573.1550714285713,
            "unit": "ns/iter",
            "extra": "p75: 1538.8418 ns, p99: 2428.4001 ns, n: 42"
          },
          {
            "name": "cms / createPolicyContext",
            "value": 5.591641342716699,
            "unit": "ns/iter",
            "extra": "p75: 5.4561 ns, p99: 11.9185 ns, n: 8952"
          },
          {
            "name": "cms / column filtering / filterRecordsColumns: 100 rows",
            "value": 51986,
            "unit": "ns/iter",
            "extra": "p75: 50424 ns, p99: 133657 ns, n: 9628"
          },
          {
            "name": "cms / column filtering / filterRecordsColumns: 1,000 rows",
            "value": 533587,
            "unit": "ns/iter",
            "extra": "p75: 514317 ns, p99: 1229930 ns, n: 947"
          },
          {
            "name": "cms / parseRoute: list URL",
            "value": 334.2040975000001,
            "unit": "ns/iter",
            "extra": "p75: 332.0607 ns, p99: 551.4516 ns, n: 160"
          },
          {
            "name": "cms / parseRoute: detail URL",
            "value": 410.35912348484845,
            "unit": "ns/iter",
            "extra": "p75: 412.8816 ns, p99: 549.9073 ns, n: 132"
          },
          {
            "name": "cms / parseRoute: edit URL",
            "value": 439.54158951612914,
            "unit": "ns/iter",
            "extra": "p75: 439.8363 ns, p99: 598.6722 ns, n: 124"
          },
          {
            "name": "cms / parseRoute: unknown table (404)",
            "value": 318.3875678571428,
            "unit": "ns/iter",
            "extra": "p75: 321.9478 ns, p99: 332.2239 ns, n: 168"
          },
          {
            "name": "cms / resolveAction: GET list",
            "value": 17.744543352192345,
            "unit": "ns/iter",
            "extra": "p75: 17.9715 ns, p99: 19.6779 ns, n: 2828"
          },
          {
            "name": "cms / matchPluginRoute: 20 routes, match last",
            "value": 4759.3754,
            "unit": "ns/iter",
            "extra": "p75: 4724.3623 ns, p99: 5612.9952 ns, n: 21"
          },
          {
            "name": "core / introspectFullSchema: blog schema (6 tables + relations)",
            "value": 27362,
            "unit": "ns/iter",
            "extra": "p75: 25327 ns, p99: 60629 ns, n: 18283"
          },
          {
            "name": "core / introspectTable: single table",
            "value": 1562.0499767441854,
            "unit": "ns/iter",
            "extra": "p75: 1560.6234 ns, p99: 1673.4275 ns, n: 43"
          },
          {
            "name": "core / mapColumnsToFields: single table",
            "value": 5734.539121052631,
            "unit": "ns/iter",
            "extra": "p75: 5738.105 ns, p99: 5897.7821 ns, n: 19"
          },
          {
            "name": "ui / escapeHtml: 60-char mixed string",
            "value": 828.6560549295772,
            "unit": "ns/iter",
            "extra": "p75: 832.6668 ns, p99: 930.1001 ns, n: 71"
          },
          {
            "name": "ui / html tagged template: small fragment",
            "value": 1456.102751111111,
            "unit": "ns/iter",
            "extra": "p75: 1460.3978 ns, p99: 1536.9255 ns, n: 45"
          },
          {
            "name": "ui / gridItems: 100 thumbnails",
            "value": 722848,
            "unit": "ns/iter",
            "extra": "p75: 650137 ns, p99: 1927378 ns, n: 701"
          },
          {
            "name": "ui / list view render / listTable: 25 rows × 5 columns",
            "value": 157322,
            "unit": "ns/iter",
            "extra": "p75: 151833 ns, p99: 284839 ns, n: 3189"
          },
          {
            "name": "ui / list view render / listTable: 100 rows × 5 columns",
            "value": 609890,
            "unit": "ns/iter",
            "extra": "p75: 587655 ns, p99: 1099278 ns, n: 830"
          },
          {
            "name": "ui / list view render / listTable: 1,000 rows × 5 columns",
            "value": 6351489,
            "unit": "ns/iter",
            "extra": "p75: 6266455 ns, p99: 11025321 ns, n: 89"
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
          "id": "b52d8cd3f7240db58a9e032367d0ff33de78441d",
          "message": "Merge pull request #97 from hotsauce-team/admin-no-store\n\nfeat(cms): send Cache-Control: no-store on admin and account screens",
          "timestamp": "2026-07-17T17:38:14Z",
          "url": "https://github.com/hotsauce-team/hotsauce/commit/b52d8cd3f7240db58a9e032367d0ff33de78441d"
        },
        "date": 1784531691792,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "auth / signJwt (HS256)",
            "value": 64875,
            "unit": "ns/iter",
            "extra": "p75: 66798 ns, p99: 112406 ns, n: 7725"
          },
          {
            "name": "auth / verifyJwt (HS256)",
            "value": 69984,
            "unit": "ns/iter",
            "extra": "p75: 72747 ns, p99: 112426 ns, n: 7154"
          },
          {
            "name": "auth / createJwtPayload",
            "value": 74.44795234604106,
            "unit": "ns/iter",
            "extra": "p75: 73.9561 ns, p99: 90.1611 ns, n: 682"
          },
          {
            "name": "auth / getTokenFromCookies: 3-cookie header",
            "value": 754.5586714285715,
            "unit": "ns/iter",
            "extra": "p75: 747.5071 ns, p99: 1655.6513 ns, n: 77"
          },
          {
            "name": "auth / createAuthCookie",
            "value": 235.28022914798206,
            "unit": "ns/iter",
            "extra": "p75: 235.6257 ns, p99: 251.6603 ns, n: 223"
          },
          {
            "name": "cms / e2e: GET /admin — dashboard",
            "value": 126452,
            "unit": "ns/iter",
            "extra": "p75: 121209 ns, p99: 426799 ns, n: 3963"
          },
          {
            "name": "cms / e2e: GET /admin/posts/1 — detail page",
            "value": 434512,
            "unit": "ns/iter",
            "extra": "p75: 446409 ns, p99: 987578 ns, n: 1161"
          },
          {
            "name": "cms / e2e: GET /admin/posts/1/edit — edit form",
            "value": 584838,
            "unit": "ns/iter",
            "extra": "p75: 580817 ns, p99: 1280161 ns, n: 868"
          },
          {
            "name": "cms / e2e: GET /admin/posts — list with JWT auth + row/column policies",
            "value": 1416051,
            "unit": "ns/iter",
            "extra": "p75: 1637197 ns, p99: 3914200 ns, n: 362"
          },
          {
            "name": "cms / e2e: POST /admin/posts/new — create (form submit)",
            "value": 915774,
            "unit": "ns/iter",
            "extra": "p75: 1004233 ns, p99: 1939614 ns, n: 398"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/users — list page (25-row table)",
            "value": 646610,
            "unit": "ns/iter",
            "extra": "p75: 631032 ns, p99: 1294792 ns, n: 784"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/posts — default page of 25 (1,000-row table)",
            "value": 753406,
            "unit": "ns/iter",
            "extra": "p75: 748386 ns, p99: 1426346 ns, n: 675"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/posts?limit=100 — page of 100 (1,000-row table)",
            "value": 1523133,
            "unit": "ns/iter",
            "extra": "p75: 1475458 ns, p99: 2600771 ns, n: 339"
          },
          {
            "name": "cms / buildPolicyWhere: pk check + policy condition",
            "value": 1572.2095714285717,
            "unit": "ns/iter",
            "extra": "p75: 1557.7465 ns, p99: 2081.0332 ns, n: 42"
          },
          {
            "name": "cms / createPolicyContext",
            "value": 5.590638999329893,
            "unit": "ns/iter",
            "extra": "p75: 5.4931 ns, p99: 9.1165 ns, n: 8954"
          },
          {
            "name": "cms / column filtering / filterRecordsColumns: 100 rows",
            "value": 54364,
            "unit": "ns/iter",
            "extra": "p75: 52638 ns, p99: 123482 ns, n: 9208"
          },
          {
            "name": "cms / column filtering / filterRecordsColumns: 1,000 rows",
            "value": 548929,
            "unit": "ns/iter",
            "extra": "p75: 536762 ns, p99: 1199911 ns, n: 921"
          },
          {
            "name": "cms / parseRoute: list URL",
            "value": 306.3540758620689,
            "unit": "ns/iter",
            "extra": "p75: 303.2976 ns, p99: 563.9181 ns, n: 174"
          },
          {
            "name": "cms / parseRoute: detail URL",
            "value": 399.97567925925927,
            "unit": "ns/iter",
            "extra": "p75: 404.7917 ns, p99: 532.7984 ns, n: 135"
          },
          {
            "name": "cms / parseRoute: edit URL",
            "value": 445.480548780488,
            "unit": "ns/iter",
            "extra": "p75: 447.6623 ns, p99: 521.8261 ns, n: 123"
          },
          {
            "name": "cms / parseRoute: unknown table (404)",
            "value": 344.62965641025636,
            "unit": "ns/iter",
            "extra": "p75: 346.9911 ns, p99: 357.017 ns, n: 156"
          },
          {
            "name": "cms / resolveAction: GET list",
            "value": 17.717839477401128,
            "unit": "ns/iter",
            "extra": "p75: 17.9326 ns, p99: 19.2626 ns, n: 2832"
          },
          {
            "name": "cms / matchPluginRoute: 20 routes, match last",
            "value": 5108,
            "unit": "ns/iter",
            "extra": "p75: 4857 ns, p99: 10306 ns, n: 97902"
          },
          {
            "name": "core / introspectFullSchema: blog schema (6 tables + relations)",
            "value": 26518,
            "unit": "ns/iter",
            "extra": "p75: 24486 ns, p99: 61060 ns, n: 18865"
          },
          {
            "name": "core / introspectTable: single table",
            "value": 1601.2823465116278,
            "unit": "ns/iter",
            "extra": "p75: 1579.2865 ns, p99: 2336.4919 ns, n: 43"
          },
          {
            "name": "core / mapColumnsToFields: single table",
            "value": 5504.323170000001,
            "unit": "ns/iter",
            "extra": "p75: 5506.4828 ns, p99: 5776.3219 ns, n: 20"
          },
          {
            "name": "ui / escapeHtml: 60-char mixed string",
            "value": 816.5817750000002,
            "unit": "ns/iter",
            "extra": "p75: 813.88 ns, p99: 1099.897 ns, n: 72"
          },
          {
            "name": "ui / html tagged template: small fragment",
            "value": 1407.8143304347825,
            "unit": "ns/iter",
            "extra": "p75: 1396.5959 ns, p99: 1980.6498 ns, n: 46"
          },
          {
            "name": "ui / gridItems: 100 thumbnails",
            "value": 640624,
            "unit": "ns/iter",
            "extra": "p75: 626644 ns, p99: 1086122 ns, n: 791"
          },
          {
            "name": "ui / list view render / listTable: 25 rows × 5 columns",
            "value": 155136,
            "unit": "ns/iter",
            "extra": "p75: 148849 ns, p99: 314435 ns, n: 3233"
          },
          {
            "name": "ui / list view render / listTable: 100 rows × 5 columns",
            "value": 572884,
            "unit": "ns/iter",
            "extra": "p75: 567488 ns, p99: 712923 ns, n: 883"
          },
          {
            "name": "ui / list view render / listTable: 1,000 rows × 5 columns",
            "value": 6090957,
            "unit": "ns/iter",
            "extra": "p75: 5946690 ns, p99: 10731755 ns, n: 92"
          }
        ]
      },
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
          "id": "d93c77539c99326aef9be2709fe43b24d0a91931",
          "message": "Merge pull request #98 from hotsauce-team/rate-limit-hints\n\nfeat(cms): rate-limit hint levels (1-3) for infrastructure enforcement",
          "timestamp": "2026-07-25T21:43:46+01:00",
          "tree_id": "ab1beafe757c5f166f0e8e9d9957241d77c15a6c",
          "url": "https://github.com/hotsauce-team/hotsauce/commit/d93c77539c99326aef9be2709fe43b24d0a91931"
        },
        "date": 1785012264263,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "auth / signJwt (HS256)",
            "value": 86767,
            "unit": "ns/iter",
            "extra": "p75: 98895 ns, p99: 164738 ns, n: 5776"
          },
          {
            "name": "auth / verifyJwt (HS256)",
            "value": 95099,
            "unit": "ns/iter",
            "extra": "p75: 96551 ns, p99: 148288 ns, n: 5269"
          },
          {
            "name": "auth / createJwtPayload",
            "value": 67.48085319148932,
            "unit": "ns/iter",
            "extra": "p75: 66.5015 ns, p99: 97.1378 ns, n: 752"
          },
          {
            "name": "auth / getTokenFromCookies: 3-cookie header",
            "value": 817.4206055555559,
            "unit": "ns/iter",
            "extra": "p75: 789.8116 ns, p99: 1176.2629 ns, n: 72"
          },
          {
            "name": "auth / createAuthCookie",
            "value": 239.93602201834864,
            "unit": "ns/iter",
            "extra": "p75: 236.3325 ns, p99: 406.5651 ns, n: 218"
          },
          {
            "name": "cms / e2e: GET /admin — dashboard",
            "value": 170699,
            "unit": "ns/iter",
            "extra": "p75: 170769 ns, p99: 437059 ns, n: 2939"
          },
          {
            "name": "cms / e2e: GET /admin/posts/1 — detail page",
            "value": 494407,
            "unit": "ns/iter",
            "extra": "p75: 502661 ns, p99: 1045617 ns, n: 1021"
          },
          {
            "name": "cms / e2e: GET /admin/posts/1/edit — edit form",
            "value": 611823,
            "unit": "ns/iter",
            "extra": "p75: 626522 ns, p99: 1205607 ns, n: 827"
          },
          {
            "name": "cms / e2e: GET /admin/posts — list with JWT auth + row/column policies",
            "value": 1235218,
            "unit": "ns/iter",
            "extra": "p75: 1240833 ns, p99: 1959127 ns, n: 415"
          },
          {
            "name": "cms / e2e: POST /admin/posts/new — create (form submit)",
            "value": 937938,
            "unit": "ns/iter",
            "extra": "p75: 959521 ns, p99: 1693810 ns, n: 393"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/users — list page (25-row table)",
            "value": 678717,
            "unit": "ns/iter",
            "extra": "p75: 658753 ns, p99: 1327855 ns, n: 752"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/posts — default page of 25 (1,000-row table)",
            "value": 857277,
            "unit": "ns/iter",
            "extra": "p75: 825074 ns, p99: 1490449 ns, n: 593"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/posts?limit=100 — page of 100 (1,000-row table)",
            "value": 1572731,
            "unit": "ns/iter",
            "extra": "p75: 1569026 ns, p99: 2080995 ns, n: 328"
          },
          {
            "name": "cms / buildPolicyWhere: pk check + policy condition",
            "value": 1901.8357972972979,
            "unit": "ns/iter",
            "extra": "p75: 1885.3935 ns, p99: 2681.3541 ns, n: 37"
          },
          {
            "name": "cms / createPolicyContext",
            "value": 5.4415534079790415,
            "unit": "ns/iter",
            "extra": "p75: 5.2489 ns, p99: 12.5315 ns, n: 9199"
          },
          {
            "name": "cms / column filtering / filterRecordsColumns: 100 rows",
            "value": 54658,
            "unit": "ns/iter",
            "extra": "p75: 52679 ns, p99: 113392 ns, n: 9158"
          },
          {
            "name": "cms / column filtering / filterRecordsColumns: 1,000 rows",
            "value": 548865,
            "unit": "ns/iter",
            "extra": "p75: 541003 ns, p99: 689240 ns, n: 921"
          },
          {
            "name": "cms / parseRoute: list URL",
            "value": 357.38349400000004,
            "unit": "ns/iter",
            "extra": "p75: 353.743 ns, p99: 494.7719 ns, n: 150"
          },
          {
            "name": "cms / parseRoute: detail URL",
            "value": 447.66067704918026,
            "unit": "ns/iter",
            "extra": "p75: 448.284 ns, p99: 582.1344 ns, n: 122"
          },
          {
            "name": "cms / parseRoute: edit URL",
            "value": 502.4761090909094,
            "unit": "ns/iter",
            "extra": "p75: 502.0376 ns, p99: 588.4863 ns, n: 110"
          },
          {
            "name": "cms / parseRoute: unknown table (404)",
            "value": 382.8716893617022,
            "unit": "ns/iter",
            "extra": "p75: 383.6753 ns, p99: 392.2842 ns, n: 141"
          },
          {
            "name": "cms / resolveAction: GET list",
            "value": 16.897049595959583,
            "unit": "ns/iter",
            "extra": "p75: 16.7554 ns, p99: 18.6619 ns, n: 2970"
          },
          {
            "name": "cms / matchPluginRoute: 20 routes, match last",
            "value": 5043,
            "unit": "ns/iter",
            "extra": "p75: 4879 ns, p99: 10639 ns, n: 99179"
          },
          {
            "name": "core / introspectFullSchema: blog schema (6 tables + relations)",
            "value": 28783,
            "unit": "ns/iter",
            "extra": "p75: 25888 ns, p99: 82163 ns, n: 17381"
          },
          {
            "name": "core / introspectTable: single table",
            "value": 1619.0353170731712,
            "unit": "ns/iter",
            "extra": "p75: 1617.3857 ns, p99: 1711.8509 ns, n: 41"
          },
          {
            "name": "core / mapColumnsToFields: single table",
            "value": 6041.637263157895,
            "unit": "ns/iter",
            "extra": "p75: 6051.8925 ns, p99: 6234.3539 ns, n: 19"
          },
          {
            "name": "ui / escapeHtml: 60-char mixed string",
            "value": 956.4194555555557,
            "unit": "ns/iter",
            "extra": "p75: 952.6645 ns, p99: 1274.3286 ns, n: 63"
          },
          {
            "name": "ui / html tagged template: small fragment",
            "value": 1642.2776512195119,
            "unit": "ns/iter",
            "extra": "p75: 1639.7464 ns, p99: 1971.1638 ns, n: 41"
          },
          {
            "name": "ui / gridItems: 100 thumbnails",
            "value": 626215,
            "unit": "ns/iter",
            "extra": "p75: 615388 ns, p99: 1211531 ns, n: 809"
          },
          {
            "name": "ui / list view render / listTable: 25 rows × 5 columns",
            "value": 150645,
            "unit": "ns/iter",
            "extra": "p75: 146644 ns, p99: 268922 ns, n: 3329"
          },
          {
            "name": "ui / list view render / listTable: 100 rows × 5 columns",
            "value": 599340,
            "unit": "ns/iter",
            "extra": "p75: 591334 ns, p99: 816594 ns, n: 844"
          },
          {
            "name": "ui / list view render / listTable: 1,000 rows × 5 columns",
            "value": 6192324,
            "unit": "ns/iter",
            "extra": "p75: 6101250 ns, p99: 10161747 ns, n: 91"
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
          "id": "d93c77539c99326aef9be2709fe43b24d0a91931",
          "message": "Merge pull request #98 from hotsauce-team/rate-limit-hints\n\nfeat(cms): rate-limit hint levels (1-3) for infrastructure enforcement",
          "timestamp": "2026-07-25T20:43:46Z",
          "url": "https://github.com/hotsauce-team/hotsauce/commit/d93c77539c99326aef9be2709fe43b24d0a91931"
        },
        "date": 1785136710215,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "auth / signJwt (HS256)",
            "value": 62717,
            "unit": "ns/iter",
            "extra": "p75: 64296 ns, p99: 115667 ns, n: 7982"
          },
          {
            "name": "auth / verifyJwt (HS256)",
            "value": 75720,
            "unit": "ns/iter",
            "extra": "p75: 77615 ns, p99: 147249 ns, n: 6613"
          },
          {
            "name": "auth / createJwtPayload",
            "value": 74.48305865102643,
            "unit": "ns/iter",
            "extra": "p75: 73.8498 ns, p99: 81.4772 ns, n: 682"
          },
          {
            "name": "auth / getTokenFromCookies: 3-cookie header",
            "value": 645.6428306818178,
            "unit": "ns/iter",
            "extra": "p75: 648.9589 ns, p99: 1031.8712 ns, n: 88"
          },
          {
            "name": "auth / createAuthCookie",
            "value": 216.2257264462809,
            "unit": "ns/iter",
            "extra": "p75: 220.7613 ns, p99: 264.8948 ns, n: 242"
          },
          {
            "name": "cms / e2e: GET /admin — dashboard",
            "value": 126715,
            "unit": "ns/iter",
            "extra": "p75: 119768 ns, p99: 347466 ns, n: 3955"
          },
          {
            "name": "cms / e2e: GET /admin/posts/1 — detail page",
            "value": 443349,
            "unit": "ns/iter",
            "extra": "p75: 453234 ns, p99: 1050211 ns, n: 1137"
          },
          {
            "name": "cms / e2e: GET /admin/posts/1/edit — edit form",
            "value": 559754,
            "unit": "ns/iter",
            "extra": "p75: 564099 ns, p99: 1249758 ns, n: 903"
          },
          {
            "name": "cms / e2e: GET /admin/posts — list with JWT auth + row/column policies",
            "value": 1256484,
            "unit": "ns/iter",
            "extra": "p75: 1229288 ns, p99: 2328752 ns, n: 409"
          },
          {
            "name": "cms / e2e: POST /admin/posts/new — create (form submit)",
            "value": 860619,
            "unit": "ns/iter",
            "extra": "p75: 935821 ns, p99: 1744384 ns, n: 422"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/users — list page (25-row table)",
            "value": 622382,
            "unit": "ns/iter",
            "extra": "p75: 618209 ns, p99: 1289658 ns, n: 813"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/posts — default page of 25 (1,000-row table)",
            "value": 773513,
            "unit": "ns/iter",
            "extra": "p75: 753000 ns, p99: 1437847 ns, n: 656"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/posts?limit=100 — page of 100 (1,000-row table)",
            "value": 1517843,
            "unit": "ns/iter",
            "extra": "p75: 1481012 ns, p99: 2363406 ns, n: 340"
          },
          {
            "name": "cms / buildPolicyWhere: pk check + policy condition",
            "value": 1678.7663564102568,
            "unit": "ns/iter",
            "extra": "p75: 1554.2286 ns, p99: 3126.7014 ns, n: 39"
          },
          {
            "name": "cms / createPolicyContext",
            "value": 5.58526687123408,
            "unit": "ns/iter",
            "extra": "p75: 5.4801 ns, p99: 8.3054 ns, n: 8962"
          },
          {
            "name": "cms / column filtering / filterRecordsColumns: 100 rows",
            "value": 51889,
            "unit": "ns/iter",
            "extra": "p75: 50645 ns, p99: 104045 ns, n: 9648"
          },
          {
            "name": "cms / column filtering / filterRecordsColumns: 1,000 rows",
            "value": 536795,
            "unit": "ns/iter",
            "extra": "p75: 519293 ns, p99: 1201207 ns, n: 942"
          },
          {
            "name": "cms / parseRoute: list URL",
            "value": 292.8386287292818,
            "unit": "ns/iter",
            "extra": "p75: 290.2767 ns, p99: 573.5932 ns, n: 181"
          },
          {
            "name": "cms / parseRoute: detail URL",
            "value": 376.59184545454553,
            "unit": "ns/iter",
            "extra": "p75: 381.4633 ns, p99: 513.4136 ns, n: 143"
          },
          {
            "name": "cms / parseRoute: edit URL",
            "value": 500.9389853211007,
            "unit": "ns/iter",
            "extra": "p75: 507.006 ns, p99: 656.0557 ns, n: 109"
          },
          {
            "name": "cms / parseRoute: unknown table (404)",
            "value": 307.738736416185,
            "unit": "ns/iter",
            "extra": "p75: 310.3776 ns, p99: 344.9671 ns, n: 173"
          },
          {
            "name": "cms / resolveAction: GET list",
            "value": 17.719926447740097,
            "unit": "ns/iter",
            "extra": "p75: 18.0268 ns, p99: 19.2507 ns, n: 2832"
          },
          {
            "name": "cms / matchPluginRoute: 20 routes, match last",
            "value": 4894,
            "unit": "ns/iter",
            "extra": "p75: 4677 ns, p99: 9815 ns, n: 102183"
          },
          {
            "name": "core / introspectFullSchema: blog schema (6 tables + relations)",
            "value": 26508,
            "unit": "ns/iter",
            "extra": "p75: 24697 ns, p99: 53941 ns, n: 18872"
          },
          {
            "name": "core / introspectTable: single table",
            "value": 1538.604825581395,
            "unit": "ns/iter",
            "extra": "p75: 1540.6171 ns, p99: 1582.6396 ns, n: 43"
          },
          {
            "name": "core / mapColumnsToFields: single table",
            "value": 5863.300247368421,
            "unit": "ns/iter",
            "extra": "p75: 5857.4669 ns, p99: 6173.9926 ns, n: 19"
          },
          {
            "name": "ui / escapeHtml: 60-char mixed string",
            "value": 814.5186361111108,
            "unit": "ns/iter",
            "extra": "p75: 811.8814 ns, p99: 1119.2645 ns, n: 72"
          },
          {
            "name": "ui / html tagged template: small fragment",
            "value": 1377.9280085106388,
            "unit": "ns/iter",
            "extra": "p75: 1376.0083 ns, p99: 1599.4245 ns, n: 47"
          },
          {
            "name": "ui / gridItems: 100 thumbnails",
            "value": 609484,
            "unit": "ns/iter",
            "extra": "p75: 596617 ns, p99: 1049701 ns, n: 830"
          },
          {
            "name": "ui / list view render / listTable: 25 rows × 5 columns",
            "value": 146297,
            "unit": "ns/iter",
            "extra": "p75: 141690 ns, p99: 259216 ns, n: 3433"
          },
          {
            "name": "ui / list view render / listTable: 100 rows × 5 columns",
            "value": 575047,
            "unit": "ns/iter",
            "extra": "p75: 569738 ns, p99: 764046 ns, n: 880"
          },
          {
            "name": "ui / list view render / listTable: 1,000 rows × 5 columns",
            "value": 6067820,
            "unit": "ns/iter",
            "extra": "p75: 5944130 ns, p99: 10603979 ns, n: 92"
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
          "id": "d93c77539c99326aef9be2709fe43b24d0a91931",
          "message": "Merge pull request #98 from hotsauce-team/rate-limit-hints\n\nfeat(cms): rate-limit hint levels (1-3) for infrastructure enforcement",
          "timestamp": "2026-07-25T20:43:46Z",
          "url": "https://github.com/hotsauce-team/hotsauce/commit/d93c77539c99326aef9be2709fe43b24d0a91931"
        },
        "date": 1785741454268,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "auth / signJwt (HS256)",
            "value": 86005,
            "unit": "ns/iter",
            "extra": "p75: 99680 ns, p99: 158412 ns, n: 5826"
          },
          {
            "name": "auth / verifyJwt (HS256)",
            "value": 94501,
            "unit": "ns/iter",
            "extra": "p75: 93726 ns, p99: 152906 ns, n: 5301"
          },
          {
            "name": "auth / createJwtPayload",
            "value": 76.88467816265043,
            "unit": "ns/iter",
            "extra": "p75: 76.0774 ns, p99: 103.3695 ns, n: 664"
          },
          {
            "name": "auth / getTokenFromCookies: 3-cookie header",
            "value": 799.1006356164384,
            "unit": "ns/iter",
            "extra": "p75: 784.3042 ns, p99: 1356.4462 ns, n: 73"
          },
          {
            "name": "auth / createAuthCookie",
            "value": 230.73034273127743,
            "unit": "ns/iter",
            "extra": "p75: 235.8045 ns, p99: 264.2647 ns, n: 227"
          },
          {
            "name": "cms / e2e: GET /admin — dashboard",
            "value": 171356,
            "unit": "ns/iter",
            "extra": "p75: 172092 ns, p99: 404808 ns, n: 2927"
          },
          {
            "name": "cms / e2e: GET /admin/posts/1 — detail page",
            "value": 494309,
            "unit": "ns/iter",
            "extra": "p75: 505556 ns, p99: 1112703 ns, n: 1022"
          },
          {
            "name": "cms / e2e: GET /admin/posts/1/edit — edit form",
            "value": 630489,
            "unit": "ns/iter",
            "extra": "p75: 644918 ns, p99: 1251463 ns, n: 803"
          },
          {
            "name": "cms / e2e: GET /admin/posts — list with JWT auth + row/column policies",
            "value": 1277309,
            "unit": "ns/iter",
            "extra": "p75: 1273875 ns, p99: 1978063 ns, n: 402"
          },
          {
            "name": "cms / e2e: POST /admin/posts/new — create (form submit)",
            "value": 1009926,
            "unit": "ns/iter",
            "extra": "p75: 1045527 ns, p99: 2712909 ns, n: 365"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/users — list page (25-row table)",
            "value": 878291,
            "unit": "ns/iter",
            "extra": "p75: 944391 ns, p99: 3310841 ns, n: 588"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/posts — default page of 25 (1,000-row table)",
            "value": 928710,
            "unit": "ns/iter",
            "extra": "p75: 905896 ns, p99: 2921722 ns, n: 553"
          },
          {
            "name": "cms / e2e list page / e2e: GET /admin/posts?limit=100 — page of 100 (1,000-row table)",
            "value": 2033038,
            "unit": "ns/iter",
            "extra": "p75: 2466253 ns, p99: 3758414 ns, n: 254"
          },
          {
            "name": "cms / buildPolicyWhere: pk check + policy condition",
            "value": 1839.5522675675672,
            "unit": "ns/iter",
            "extra": "p75: 1688.2981 ns, p99: 6695.903 ns, n: 37"
          },
          {
            "name": "cms / createPolicyContext",
            "value": 5.425669268292597,
            "unit": "ns/iter",
            "extra": "p75: 5.2489 ns, p99: 12.5695 ns, n: 9225"
          },
          {
            "name": "cms / column filtering / filterRecordsColumns: 100 rows",
            "value": 58336,
            "unit": "ns/iter",
            "extra": "p75: 56074 ns, p99: 139662 ns, n: 8581"
          },
          {
            "name": "cms / column filtering / filterRecordsColumns: 1,000 rows",
            "value": 591522,
            "unit": "ns/iter",
            "extra": "p75: 573494 ns, p99: 1134806 ns, n: 855"
          },
          {
            "name": "cms / parseRoute: list URL",
            "value": 363.7208790540541,
            "unit": "ns/iter",
            "extra": "p75: 363.1872 ns, p99: 500.7468 ns, n: 148"
          },
          {
            "name": "cms / parseRoute: detail URL",
            "value": 450.71207603305794,
            "unit": "ns/iter",
            "extra": "p75: 452.2841 ns, p99: 610.9964 ns, n: 121"
          },
          {
            "name": "cms / parseRoute: edit URL",
            "value": 505.4069559633027,
            "unit": "ns/iter",
            "extra": "p75: 505.2082 ns, p99: 630.9106 ns, n: 109"
          },
          {
            "name": "cms / parseRoute: unknown table (404)",
            "value": 378.67325422535197,
            "unit": "ns/iter",
            "extra": "p75: 381.2209 ns, p99: 395.9686 ns, n: 142"
          },
          {
            "name": "cms / resolveAction: GET list",
            "value": 16.905171799191308,
            "unit": "ns/iter",
            "extra": "p75: 16.7363 ns, p99: 19.3913 ns, n: 2968"
          },
          {
            "name": "cms / matchPluginRoute: 20 routes, match last",
            "value": 4877.552176190477,
            "unit": "ns/iter",
            "extra": "p75: 4864.7595 ns, p99: 5298.9775 ns, n: 21"
          },
          {
            "name": "core / introspectFullSchema: blog schema (6 tables + relations)",
            "value": 28417,
            "unit": "ns/iter",
            "extra": "p75: 26009 ns, p99: 73278 ns, n: 17605"
          },
          {
            "name": "core / introspectTable: single table",
            "value": 1642.2112146341462,
            "unit": "ns/iter",
            "extra": "p75: 1650.1781 ns, p99: 1696.1456 ns, n: 41"
          },
          {
            "name": "core / mapColumnsToFields: single table",
            "value": 6492.698733333334,
            "unit": "ns/iter",
            "extra": "p75: 6500.475 ns, p99: 6699.2047 ns, n: 18"
          },
          {
            "name": "ui / escapeHtml: 60-char mixed string",
            "value": 975.4973290322583,
            "unit": "ns/iter",
            "extra": "p75: 971.014 ns, p99: 1278.9009 ns, n: 62"
          },
          {
            "name": "ui / html tagged template: small fragment",
            "value": 1645.6806097560973,
            "unit": "ns/iter",
            "extra": "p75: 1651.697 ns, p99: 1777.7019 ns, n: 41"
          },
          {
            "name": "ui / gridItems: 100 thumbnails",
            "value": 641249,
            "unit": "ns/iter",
            "extra": "p75: 625597 ns, p99: 1266712 ns, n: 790"
          },
          {
            "name": "ui / list view render / listTable: 25 rows × 5 columns",
            "value": 156050,
            "unit": "ns/iter",
            "extra": "p75: 151986 ns, p99: 299023 ns, n: 3215"
          },
          {
            "name": "ui / list view render / listTable: 100 rows × 5 columns",
            "value": 619257,
            "unit": "ns/iter",
            "extra": "p75: 601201 ns, p99: 1044845 ns, n: 817"
          },
          {
            "name": "ui / list view render / listTable: 1,000 rows × 5 columns",
            "value": 6386899,
            "unit": "ns/iter",
            "extra": "p75: 6326507 ns, p99: 10232552 ns, n: 88"
          }
        ]
      }
    ]
  }
}