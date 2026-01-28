import express from 'express';
import { env } from '../env.js';
import { fetchJson } from '../http.js';
import { cacheKey, memCache } from '../cache.js';
import { getCache, setCache } from '../firestoreCache.js';

export const videoRouter = express.Router();

function extractYouTubeVideoId(url) {
  try {
    const u = new URL(url);
    // youtu.be/<id>
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').trim();
      return id || null;
    }
    // youtube.com/watch?v=<id>
    const v = u.searchParams.get('v');
    if (v) return v;
    // youtube.com/embed/<id>
    const parts = u.pathname.split('/').filter(Boolean);
    const embedIdx = parts.indexOf('embed');
    if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
    return null;
  } catch {
    return null;
  }
}

async function tryGoogleCseVideos(query, limit) {
  if (!env.googleCseApiKey || !env.googleCseCx) return [];
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', env.googleCseApiKey);
  url.searchParams.set('cx', env.googleCseCx);
  url.searchParams.set('q', query);
  url.searchParams.set('num', String(Math.max(1, Math.min(10, limit || 5))));
  // Bias towards YouTube results
  url.searchParams.set('siteSearch', 'youtube.com');
  url.searchParams.set('safe', 'active');

  const data = await fetchJson(url.toString());
  const items = Array.isArray(data?.items) ? data.items : [];
  const vids = [];
  for (const it of items) {
    const link = it?.link;
    const id = link ? extractYouTubeVideoId(link) : null;
    if (!id) continue;
    vids.push({
      videoId: id,
      title: it?.title ?? 'YouTube Video',
      description: it?.snippet ?? '',
      thumbnail: it?.pagemap?.cse_thumbnail?.[0]?.src ?? it?.pagemap?.cse_image?.[0]?.src ?? null,
      channelTitle: null
    });
  }
  return vids;
}

async function tryGoogleCseWebVideos(query, limit) {
  if (!env.googleCseApiKey || !env.googleCseCx) return [];
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', env.googleCseApiKey);
  url.searchParams.set('cx', env.googleCseCx);
  url.searchParams.set('q', query);
  url.searchParams.set('num', String(Math.max(1, Math.min(10, limit || 5))));
  url.searchParams.set('safe', 'active');

  const data = await fetchJson(url.toString());
  const items = Array.isArray(data?.items) ? data.items : [];
  const results = [];
  for (const it of items) {
    const link = String(it?.link || '').trim();
    if (!link) continue;
    // Exclude YouTube (handled separately)
    if (link.includes('youtube.com') || link.includes('youtu.be')) continue;
    if (!looksLikeVideoResult(it)) continue;
    if (!isAllowedVideoHost(link)) continue;
    results.push({
      title: it?.title ?? 'Web video',
      link,
      snippet: it?.snippet ?? '',
      thumbnail:
        it?.pagemap?.cse_thumbnail?.[0]?.src ??
        it?.pagemap?.cse_image?.[0]?.src ??
        null,
      source: it?.displayLink ?? null
    });
    if (results.length >= (limit || 5)) break;
  }
  return results;
}

const DSA_REFERENCE_LINKS = {
  Arrays: [
    { title: 'GeeksforGeeks: Introduction to Arrays', link: 'https://www.geeksforgeeks.org/introduction-to-arrays/' },
    { title: 'Programiz: Array Data Structure', link: 'https://www.programiz.com/dsa/array' }
  ],
  'Linked List': [
    { title: 'GeeksforGeeks: Linked List Data Structure', link: 'https://www.geeksforgeeks.org/linked-list-data-structure/' },
    { title: 'Programiz: Linked List', link: 'https://www.programiz.com/dsa/linked-list' }
  ],
  Stack: [
    { title: 'GeeksforGeeks: Stack Data Structure', link: 'https://www.geeksforgeeks.org/stack-data-structure/' },
    { title: 'Programiz: Stack', link: 'https://www.programiz.com/dsa/stack' }
  ],
  Queue: [
    { title: 'GeeksforGeeks: Queue Data Structure', link: 'https://www.geeksforgeeks.org/queue-data-structure/' },
    { title: 'Programiz: Queue', link: 'https://www.programiz.com/dsa/queue' }
  ],
  'Two Pointers': [
    { title: 'GeeksforGeeks: Two Pointers Technique', link: 'https://www.geeksforgeeks.org/two-pointers-technique/' },
    { title: 'InterviewBit: Two Pointer Technique', link: 'https://www.interviewbit.com/blog/two-pointer-technique/' }
  ],
  'Sliding Window': [
    { title: 'GeeksforGeeks: Sliding Window Technique', link: 'https://www.geeksforgeeks.org/window-sliding-technique/' },
    { title: 'Coding Ninjas: Sliding Window', link: 'https://www.codingninjas.com/studio/library/sliding-window-technique' }
  ],
  'Prefix Sums': [
    { title: 'GeeksforGeeks: Prefix Sum Array', link: 'https://www.geeksforgeeks.org/prefix-sum-array-implementation-applications-competitive-programming/' },
    { title: 'CP-Algorithms: Prefix Sums', link: 'https://cp-algorithms.com/data_structures/prefix-sums.html' }
  ],
  Hashing: [
    { title: 'GeeksforGeeks: Hashing Data Structure', link: 'https://www.geeksforgeeks.org/hashing-data-structure/' },
    { title: 'Programiz: Hash Table', link: 'https://www.programiz.com/dsa/hash-table' }
  ],
  'Binary Search': [
    { title: 'GeeksforGeeks: Binary Search', link: 'https://www.geeksforgeeks.org/binary-search/' },
    { title: 'Programiz: Binary Search', link: 'https://www.programiz.com/dsa/binary-search' }
  ],
  'Binary Search Tree': [
    { title: 'GeeksforGeeks: Binary Search Tree', link: 'https://www.geeksforgeeks.org/binary-search-tree-data-structure/' },
    { title: 'Programiz: Binary Search Tree', link: 'https://www.programiz.com/dsa/binary-search-tree' }
  ],
  'Heap / Priority Queue': [
    { title: 'GeeksforGeeks: Heap Data Structure', link: 'https://www.geeksforgeeks.org/heap-data-structure/' },
    { title: 'Programiz: Heap', link: 'https://www.programiz.com/dsa/heap-data-structure' }
  ],
  Trie: [
    { title: 'GeeksforGeeks: Trie Data Structure', link: 'https://www.geeksforgeeks.org/trie-data-structure/' },
    { title: 'Programiz: Trie', link: 'https://www.programiz.com/dsa/trie' }
  ],
  'Disjoint Set (DSU)': [
    { title: 'GeeksforGeeks: Disjoint Set Data Structure', link: 'https://www.geeksforgeeks.org/disjoint-set-data-structures/' },
    { title: 'CP-Algorithms: Disjoint Set Union', link: 'https://cp-algorithms.com/data_structures/disjoint_set_union.html' }
  ],
  'Graph Traversal (BFS / DFS)': [
    { title: 'GeeksforGeeks: Breadth First Search', link: 'https://www.geeksforgeeks.org/breadth-first-search-or-bfs-for-a-graph/' },
    { title: 'Programiz: Graph Traversal', link: 'https://www.programiz.com/dsa/graph-traversal' }
  ],
  'Topological Sort': [
    { title: 'GeeksforGeeks: Topological Sorting', link: 'https://www.geeksforgeeks.org/topological-sorting/' },
    { title: 'Programiz: Topological Sort', link: 'https://www.programiz.com/dsa/topological-sort' }
  ],
  'Greedy Patterns': [
    { title: 'GeeksforGeeks: Greedy Algorithms', link: 'https://www.geeksforgeeks.org/greedy-algorithms/' },
    { title: 'Programiz: Greedy Algorithm', link: 'https://www.programiz.com/dsa/greedy-algorithm' }
  ],
  'Shortest Paths (Dijkstra)': [
    { title: "GeeksforGeeks: Dijkstra's Algorithm", link: 'https://www.geeksforgeeks.org/dijkstras-shortest-path-algorithm-greedy-algo-7/' },
    { title: 'Programiz: Dijkstra Algorithm', link: 'https://www.programiz.com/dsa/dijkstra-algorithm' }
  ],
  'Minimum Spanning Tree': [
    { title: 'GeeksforGeeks: Minimum Spanning Tree', link: 'https://www.geeksforgeeks.org/minimum-spanning-tree/' },
    { title: 'Programiz: Spanning Tree', link: 'https://www.programiz.com/dsa/spanning-tree' }
  ],
  'Merge Sort': [
    { title: 'GeeksforGeeks: Merge Sort', link: 'https://www.geeksforgeeks.org/merge-sort/' },
    { title: 'Programiz: Merge Sort', link: 'https://www.programiz.com/dsa/merge-sort' }
  ],
  'Quick Sort': [
    { title: 'GeeksforGeeks: Quick Sort', link: 'https://www.geeksforgeeks.org/quick-sort/' },
    { title: 'Programiz: Quick Sort', link: 'https://www.programiz.com/dsa/quick-sort' }
  ],
  Backtracking: [
    { title: 'GeeksforGeeks: Introduction to Backtracking', link: 'https://www.geeksforgeeks.org/introduction-to-backtracking-data-structure-algorithm-tutorials/' },
    { title: 'Programiz: Backtracking Algorithm', link: 'https://www.programiz.com/dsa/backtracking-algorithm' }
  ],
  'Dynamic Programming': [
    { title: 'GeeksforGeeks: Dynamic Programming', link: 'https://www.geeksforgeeks.org/dynamic-programming/' },
    { title: 'CP-Algorithms: DP Introduction', link: 'https://cp-algorithms.com/dynamic_programming/introduction.html' }
  ],
  'Bit Manipulation': [
    { title: 'GeeksforGeeks: Bitwise Operators in C/C++', link: 'https://www.geeksforgeeks.org/bitwise-operators-in-c-cpp/' },
    { title: 'Programiz: Bitwise Operators in C', link: 'https://www.programiz.com/c-programming/bitwise-operators' }
  ],
  'Arrays & Lists': [
    { title: 'GeeksforGeeks: Introduction to Arrays', link: 'https://www.geeksforgeeks.org/introduction-to-arrays/' },
    { title: 'Programiz: Array Data Structure', link: 'https://www.programiz.com/dsa/array' }
  ],
  'Strings & Pattern Matching': [
    { title: 'GeeksforGeeks: String Data Structure', link: 'https://www.geeksforgeeks.org/string-data-structure/' },
    { title: 'GeeksforGeeks: Pattern Searching', link: 'https://www.geeksforgeeks.org/pattern-searching/' }
  ],
  'Queue & Deque': [
    { title: 'GeeksforGeeks: Queue Data Structure', link: 'https://www.geeksforgeeks.org/queue-data-structure/' },
    { title: 'GeeksforGeeks: Deque Data Structure', link: 'https://www.geeksforgeeks.org/deque-data-structure/' }
  ],
  'Prefix / Difference Arrays': [
    { title: 'GeeksforGeeks: Prefix Sum Array', link: 'https://www.geeksforgeeks.org/prefix-sum-array-implementation-applications-competitive-programming/' },
    { title: 'GeeksforGeeks: Difference Array', link: 'https://www.geeksforgeeks.org/difference-array-range-update-query-o1/' }
  ],
  'Hashing & Maps': [
    { title: 'GeeksforGeeks: Hashing Data Structure', link: 'https://www.geeksforgeeks.org/hashing-data-structure/' },
    { title: 'Programiz: Hash Table', link: 'https://www.programiz.com/dsa/hash-table' }
  ],
  'Sorting (Merge / Quick)': [
    { title: 'GeeksforGeeks: Merge Sort', link: 'https://www.geeksforgeeks.org/merge-sort/' },
    { title: 'GeeksforGeeks: Quick Sort', link: 'https://www.geeksforgeeks.org/quick-sort/' }
  ],
  'Binary Trees & Traversals': [
    { title: 'GeeksforGeeks: Binary Tree', link: 'https://www.geeksforgeeks.org/binary-tree-data-structure/' },
    { title: 'GeeksforGeeks: Tree Traversals', link: 'https://www.geeksforgeeks.org/tree-traversals-inorder-preorder-and-postorder/' }
  ],
  'Trie & Prefix Trees': [
    { title: 'GeeksforGeeks: Trie Data Structure', link: 'https://www.geeksforgeeks.org/trie-data-structure/' },
    { title: 'CP-Algorithms: Trie', link: 'https://cp-algorithms.com/string/trie.html' }
  ],
  'Disjoint Set (DSU / Union Find)': [
    { title: 'GeeksforGeeks: Disjoint Set Union', link: 'https://www.geeksforgeeks.org/disjoint-set-data-structures/' },
    { title: 'CP-Algorithms: DSU', link: 'https://cp-algorithms.com/data_structures/disjoint_set_union.html' }
  ],
  'Shortest Paths (Dijkstra / 0-1 BFS)': [
    { title: 'GeeksforGeeks: Dijkstra Algorithm', link: 'https://www.geeksforgeeks.org/dijkstras-shortest-path-algorithm-greedy-algo-7/' },
    { title: 'CP-Algorithms: 0-1 BFS', link: 'https://cp-algorithms.com/graph/01_bfs.html' }
  ],
  'Bellman-Ford & Floyd-Warshall': [
    { title: 'GeeksforGeeks: Bellman-Ford Algorithm', link: 'https://www.geeksforgeeks.org/bellman-ford-algorithm-dp-23/' },
    { title: 'GeeksforGeeks: Floyd Warshall Algorithm', link: 'https://www.geeksforgeeks.org/floyd-warshall-algorithm-dp-16/' }
  ],
  'Minimum Spanning Tree (Kruskal / Prim)': [
    { title: "GeeksforGeeks: Kruskal's Algorithm", link: 'https://www.geeksforgeeks.org/kruskals-minimum-spanning-tree-algorithm-greedy-algo-2/' },
    { title: "GeeksforGeeks: Prim's Algorithm", link: 'https://www.geeksforgeeks.org/prims-minimum-spanning-tree-mst-greedy-algo-5/' }
  ],
  'Segment Tree & Lazy Propagation': [
    { title: 'GeeksforGeeks: Segment Tree', link: 'https://www.geeksforgeeks.org/segment-tree-data-structure/' },
    { title: 'CP-Algorithms: Segment Tree (Lazy)', link: 'https://cp-algorithms.com/data_structures/segment_tree.html' }
  ],
  'Fenwick Tree (BIT)': [
    { title: 'GeeksforGeeks: Binary Indexed Tree', link: 'https://www.geeksforgeeks.org/binary-indexed-tree-or-fenwick-tree-2/' },
    { title: 'CP-Algorithms: Fenwick Tree', link: 'https://cp-algorithms.com/data_structures/fenwick.html' }
  ],
  'Sparse Table & RMQ': [
    { title: 'CP-Algorithms: Sparse Table', link: 'https://cp-algorithms.com/data_structures/sparse-table.html' },
    { title: 'GeeksforGeeks: RMQ', link: 'https://www.geeksforgeeks.org/range-minimum-query-for-static-array/' }
  ],
  'Heavy Light Decomposition': [
    { title: 'CP-Algorithms: Heavy-Light Decomposition', link: 'https://cp-algorithms.com/graph/hld.html' },
    { title: 'GeeksforGeeks: Heavy Light Decomposition', link: 'https://www.geeksforgeeks.org/heavy-light-decomposition/' }
  ],
  'Lowest Common Ancestor & Binary Lifting': [
    { title: 'CP-Algorithms: LCA (Binary Lifting)', link: 'https://cp-algorithms.com/graph/lca_binary_lifting.html' },
    { title: 'GeeksforGeeks: LCA', link: 'https://www.geeksforgeeks.org/lowest-common-ancestor-binary-tree-set-1/' }
  ],
  'Suffix Array / Suffix Automaton': [
    { title: 'CP-Algorithms: Suffix Array', link: 'https://cp-algorithms.com/string/suffix-array.html' },
    { title: 'CP-Algorithms: Suffix Automaton', link: 'https://cp-algorithms.com/string/suffix-automaton.html' }
  ],
  'Advanced Strings (KMP, Z, Rolling Hash)': [
    { title: 'GeeksforGeeks: KMP Algorithm', link: 'https://www.geeksforgeeks.org/kmp-algorithm-for-pattern-searching/' },
    { title: 'CP-Algorithms: Z-function', link: 'https://cp-algorithms.com/string/z-function.html' }
  ],
  'Dynamic Programming Basics': [
    { title: 'GeeksforGeeks: Dynamic Programming', link: 'https://www.geeksforgeeks.org/dynamic-programming/' },
    { title: 'CP-Algorithms: DP Introduction', link: 'https://cp-algorithms.com/dynamic_programming/intro-to-dp.html' }
  ],
  'DP on Subsequences / Knapsack': [
    { title: 'GeeksforGeeks: Knapsack Problem', link: 'https://www.geeksforgeeks.org/0-1-knapsack-problem-dp-10/' },
    { title: 'CP-Algorithms: Knapsack', link: 'https://cp-algorithms.com/dynamic_programming/knapsack.html' }
  ],
  'DP on Trees': [
    { title: 'CP-Algorithms: DP on Trees', link: 'https://cp-algorithms.com/dynamic_programming/tree_dp.html' },
    { title: 'GeeksforGeeks: DP on Trees', link: 'https://www.geeksforgeeks.org/dynamic-programming-on-trees/' }
  ],
  'Digit DP': [
    { title: 'GeeksforGeeks: Digit DP', link: 'https://www.geeksforgeeks.org/digit-dp/' },
    { title: 'CP-Algorithms: Digit DP', link: 'https://cp-algorithms.com/dynamic_programming/digit_dp.html' }
  ],
  'Bitmask DP': [
    { title: 'GeeksforGeeks: Bitmask DP', link: 'https://www.geeksforgeeks.org/bitmasking-and-dynamic-programming/' },
    { title: 'CP-Algorithms: DP with Bitmasks', link: 'https://cp-algorithms.com/dynamic_programming/profile-dynamics.html' }
  ],
  'Game Theory & Grundy Numbers': [
    { title: 'GeeksforGeeks: Grundy Numbers', link: 'https://www.geeksforgeeks.org/combinatorial-game-theory-set-1-introduction/' },
    { title: 'CP-Algorithms: Game Theory', link: 'https://cp-algorithms.com/game_theory/sprague-grundy-nim.html' }
  ],
  'Meet in the Middle & Divide-Conquer DP': [
    { title: 'CP-Algorithms: Meet-in-the-Middle', link: 'https://cp-algorithms.com/meet-in-the-middle.html' },
    { title: 'CP-Algorithms: Divide and Conquer DP', link: 'https://cp-algorithms.com/dynamic_programming/divide-and-conquer-dp.html' }
  ],
  "Mo's Algorithm & Offline Queries": [
    { title: "CP-Algorithms: Mo's Algorithm", link: 'https://cp-algorithms.com/data_structures/sqrt_decomposition.html#mos-algorithm' },
    { title: "GeeksforGeeks: Mo's Algorithm", link: 'https://www.geeksforgeeks.org/mos-algorithm-query-square-root-decomposition-set-1-introduction/' }
  ],
  'Persistent Data Structures': [
    { title: 'CP-Algorithms: Persistent Segment Tree', link: 'https://cp-algorithms.com/data_structures/segment_tree_persistent.html' },
    { title: 'GeeksforGeeks: Persistent Data Structures', link: 'https://www.geeksforgeeks.org/persistent-data-structures/' }
  ],
  'DSU on Tree / Small to Large': [
    { title: 'CP-Algorithms: DSU on Tree', link: 'https://cp-algorithms.com/data_structures/disjoint_set_union.html#toc-tgt-10' },
    { title: 'GeeksforGeeks: Small to Large', link: 'https://www.geeksforgeeks.org/small-to-large-set-dsu-on-tree/' }
  ],
  'Advanced Graphs (Bridges, Articulation, SCC)': [
    { title: 'CP-Algorithms: Bridges', link: 'https://cp-algorithms.com/graph/bridge-searching.html' },
    { title: 'CP-Algorithms: Strongly Connected Components', link: 'https://cp-algorithms.com/graph/strongly-connected-components.html' }
  ],
  'Flow Algorithms (Ford-Fulkerson, Dinic)': [
    { title: 'CP-Algorithms: Dinic Algorithm', link: 'https://cp-algorithms.com/graph/dinic.html' },
    { title: 'GeeksforGeeks: Ford-Fulkerson', link: 'https://www.geeksforgeeks.org/ford-fulkerson-algorithm-for-maximum-flow-problem/' }
  ],
  'Number Theory (GCD, Sieve, Modular Arithmetic)': [
    { title: 'CP-Algorithms: Euclidean Algorithm', link: 'https://cp-algorithms.com/algebra/euclid-algorithm.html' },
    { title: 'CP-Algorithms: Sieve of Eratosthenes', link: 'https://cp-algorithms.com/algebra/sieve-of-eratosthenes.html' }
  ],
  'Chinese Remainder & Modular Inverse': [
    { title: 'CP-Algorithms: Chinese Remainder Theorem', link: 'https://cp-algorithms.com/algebra/chinese-remainder-theorem.html' },
    { title: 'GeeksforGeeks: Modular Inverse', link: 'https://www.geeksforgeeks.org/multiplicative-inverse-under-modulo-m/' }
  ],
  'Combinatorics & Counting Techniques': [
    { title: 'CP-Algorithms: Combinatorics', link: 'https://cp-algorithms.com/combinatorics/basic-combinatorics.html' },
    { title: 'GeeksforGeeks: Counting', link: 'https://www.geeksforgeeks.org/counting-in-combinatorics/' }
  ],
  'Matrix Exponentiation & Linear Recurrence': [
    { title: 'CP-Algorithms: Matrix Exponentiation', link: 'https://cp-algorithms.com/algebra/binary-exp.html#applications' },
    { title: 'GeeksforGeeks: Linear Recurrence', link: 'https://www.geeksforgeeks.org/linear-recurrence-relation/' }
  ],
  'Probability & Expected Value DP': [
    { title: 'CP-Algorithms: Expected Value', link: 'https://cp-algorithms.com/probability/expected-value.html' },
    { title: 'GeeksforGeeks: Probability Basics', link: 'https://www.geeksforgeeks.org/probability-imp-concepts/' }
  ],
  'Computational Geometry & Convex Hull': [
    { title: 'CP-Algorithms: Convex Hull', link: 'https://cp-algorithms.com/geometry/convex-hull.html' },
    { title: 'GeeksforGeeks: Convex Hull', link: 'https://www.geeksforgeeks.org/convex-hull-set-1-jarviss-algorithm-or-wrapping/' }
  ],
  'Advanced Bit Manipulation': [
    { title: 'GeeksforGeeks: Bit Manipulation', link: 'https://www.geeksforgeeks.org/bit-manipulation/' },
    { title: 'CP-Algorithms: Bit Operations', link: 'https://cp-algorithms.com/algebra/bit-manipulation.html' }
  ]
};

const LANGUAGE_REFERENCE_LINKS = {
  C: {
    Pointers: [
      { title: 'GeeksforGeeks: Pointers in C', link: 'https://www.geeksforgeeks.org/pointers-in-c-and-c-set-1-introduction-arithmetic-and-array/' },
      { title: 'TutorialsPoint: C Pointers', link: 'https://www.tutorialspoint.com/cprogramming/c_pointers.htm' }
    ],
    'Arrays and Strings': [
      { title: 'GeeksforGeeks: Strings in C', link: 'https://www.geeksforgeeks.org/strings-in-c-sets-1-introduction/' },
      { title: 'TutorialsPoint: C Strings', link: 'https://www.tutorialspoint.com/cprogramming/c_strings.htm' }
    ],
    'Memory Management': [
      { title: 'GeeksforGeeks: Memory Layout of C Programs', link: 'https://www.geeksforgeeks.org/memory-layout-of-c-program/' },
      { title: 'Programiz: Memory Management in C', link: 'https://www.programiz.com/c-programming/memory-management' }
    ],
    'Structures and Unions': [
      { title: 'GeeksforGeeks: Structures vs Unions', link: 'https://www.geeksforgeeks.org/difference-structure-union-c/' },
      { title: 'TutorialsPoint: Structures and Unions', link: 'https://www.tutorialspoint.com/cprogramming/c_structures.htm' }
    ],
    Recursion: [
      { title: 'GeeksforGeeks: Recursion', link: 'https://www.geeksforgeeks.org/recursion/' },
      { title: 'Programiz: Recursion in C', link: 'https://www.programiz.com/c-programming/c-recursion' }
    ],
    'File Handling': [
      { title: 'GeeksforGeeks: File Handling in C', link: 'https://www.geeksforgeeks.org/basics-file-handling-c/' },
      { title: 'TutorialsPoint: C File I/O', link: 'https://www.tutorialspoint.com/cprogramming/c_file_io.htm' }
    ],
    'Bitwise Operators': [
      { title: 'GeeksforGeeks: Bitwise Operators', link: 'https://www.geeksforgeeks.org/bitwise-operators-in-c-cpp/' },
      { title: 'TutorialsPoint: C Bitwise Operators', link: 'https://www.tutorialspoint.com/cprogramming/c_bitwise_operators.htm' }
    ],
    'Dynamic Memory (malloc / free)': [
      { title: 'GeeksforGeeks: Dynamic Memory Allocation', link: 'https://www.geeksforgeeks.org/dynamic-memory-allocation-in-c-using-malloc-calloc-free-and-realloc/' },
      { title: 'Programiz: Dynamic Memory in C', link: 'https://www.programiz.com/c-programming/c-dynamic-memory-allocation' }
    ],
    'Function Pointers': [
      { title: 'GeeksforGeeks: Function Pointer in C', link: 'https://www.geeksforgeeks.org/function-pointer-in-c/' },
      { title: 'TutorialsPoint: Function Pointers', link: 'https://www.tutorialspoint.com/cprogramming/c_function_pointers.htm' }
    ],
    'Preprocessor and Macros': [
      { title: 'GeeksforGeeks: C Preprocessors', link: 'https://www.geeksforgeeks.org/c-preprocessors/' },
      { title: 'TutorialsPoint: C Preprocessors', link: 'https://www.tutorialspoint.com/cprogramming/c_preprocessors.htm' }
    ],
    'Compilation and Linking': [
      { title: 'GeeksforGeeks: Compilation Process in C', link: 'https://www.geeksforgeeks.org/compilation-process-in-c/' },
      { title: 'StudyTonight: Compiling and Linking', link: 'https://www.studytonight.com/c/compiling-and-linking.php' }
    ],
    'Undefined Behavior and Debugging': [
      { title: 'GeeksforGeeks: Undefined Behaviour in C', link: 'https://www.geeksforgeeks.org/undefined-behaviour-in-c/' },
      { title: 'TutorialsPoint: Debugging in C', link: 'https://www.tutorialspoint.com/cprogramming/c_debugging.htm' }
    ]
  },
  'C++': {
    'Object Oriented Programming': [
      { title: 'learncpp: Intro to OOP', link: 'https://www.learncpp.com/cpp-tutorial/introduction-to-object-oriented-programming/' },
      { title: 'GeeksforGeeks: OOP in C++', link: 'https://www.geeksforgeeks.org/object-oriented-programming-in-cpp/' }
    ],
    'Standard Template Library (STL)': [
      { title: 'GeeksforGeeks: STL Overview', link: 'https://www.geeksforgeeks.org/the-c-standard-template-library-stl/' },
      { title: 'cplusplus.com: STL Reference', link: 'https://cplusplus.com/reference/stl/' }
    ],
    Templates: [
      { title: 'GeeksforGeeks: Templates in C++', link: 'https://www.geeksforgeeks.org/templates-cpp/' },
      { title: 'learncpp: Function Templates', link: 'https://www.learncpp.com/cpp-tutorial/function-templates/' }
    ],
    'Smart Pointers': [
      { title: 'cppreference: Smart Pointers', link: 'https://en.cppreference.com/w/cpp/memory/smart_ptr' },
      { title: 'learncpp: Smart Pointers', link: 'https://www.learncpp.com/cpp-tutorial/ownership-semantics-and-smart-pointers/' }
    ],
    'Inheritance and Polymorphism': [
      { title: 'GeeksforGeeks: Inheritance in C++', link: 'https://www.geeksforgeeks.org/inheritance-in-c/' },
      { title: 'learncpp: Polymorphism', link: 'https://www.learncpp.com/cpp-tutorial/polymorphism/' }
    ],
    'Resource Acquisition Is Initialization (RAII)': [
      { title: 'cppreference: RAII', link: 'https://en.cppreference.com/w/cpp/language/raii' },
      { title: 'Modernes C++: RAII', link: 'https://www.modernescpp.com/index.php/resource-management-with-raii' }
    ],
    'Move Semantics': [
      { title: 'cppreference: Move constructors', link: 'https://en.cppreference.com/w/cpp/language/move_constructor' },
      { title: 'learncpp: Move semantics', link: 'https://www.learncpp.com/cpp-tutorial/move-constructors-and-move-assignment/' }
    ],
    References: [
      { title: 'learncpp: References', link: 'https://www.learncpp.com/cpp-tutorial/references/' },
      { title: 'GeeksforGeeks: References in C++', link: 'https://www.geeksforgeeks.org/references-in-c/' }
    ],
    'Operator Overloading': [
      { title: 'learncpp: Operator Overloading', link: 'https://www.learncpp.com/cpp-tutorial/operator-overloading/' },
      { title: 'GeeksforGeeks: Operator Overloading', link: 'https://www.geeksforgeeks.org/operator-overloading-cpp/' }
    ],
    'Exception Safety': [
      { title: 'cppreference: Exceptions', link: 'https://en.cppreference.com/w/cpp/language/exceptions' },
      { title: 'GeeksforGeeks: Exception Handling in C++', link: 'https://www.geeksforgeeks.org/exception-handling-c/' }
    ],
    'Concurrency Basics': [
      { title: 'cppreference: Threads', link: 'https://en.cppreference.com/w/cpp/thread' },
      { title: 'Modernes C++: Threading', link: 'https://www.modernescpp.com/index.php/category/threading/' }
    ],
    'Lambda Expressions': [
      { title: 'cppreference: Lambda expressions', link: 'https://en.cppreference.com/w/cpp/language/lambda' },
      { title: 'learncpp: Introduction to Lambdas', link: 'https://www.learncpp.com/cpp-tutorial/introduction-to-lambdas/' }
    ]
  },
  Java: {
    'Object Oriented Programming': [
      { title: 'Oracle Tutorial: OOP Concepts', link: 'https://docs.oracle.com/javase/tutorial/java/concepts/index.html' },
      { title: 'Baeldung: Java OOP', link: 'https://www.baeldung.com/java-oop' }
    ],
    'Collections Framework': [
      { title: 'Oracle Tutorial: Collections', link: 'https://docs.oracle.com/javase/tutorial/collections/index.html' },
      { title: 'Baeldung: Java Collections Guide', link: 'https://www.baeldung.com/java-collections' }
    ],
    Generics: [
      { title: 'Oracle Tutorial: Generics', link: 'https://docs.oracle.com/javase/tutorial/java/generics/index.html' },
      { title: 'Baeldung: Java Generics', link: 'https://www.baeldung.com/java-generics' }
    ],
    'JVM and Garbage Collection': [
      { title: 'Oracle GC Tuning Guide', link: 'https://docs.oracle.com/javase/8/docs/technotes/guides/vm/gctuning/introduction.html' },
      { title: 'Baeldung: JVM Garbage Collectors', link: 'https://www.baeldung.com/jvm-garbage-collectors' }
    ],
    Multithreading: [
      { title: 'Oracle Tutorial: Concurrency', link: 'https://docs.oracle.com/javase/tutorial/essential/concurrency/' },
      { title: 'Baeldung: Thread Lifecycle', link: 'https://www.baeldung.com/java-thread-lifecycle' }
    ],
    'Exception Handling': [
      { title: 'Oracle Tutorial: Exceptions', link: 'https://docs.oracle.com/javase/tutorial/essential/exceptions/index.html' },
      { title: 'Baeldung: Java Exceptions', link: 'https://www.baeldung.com/java-exceptions' }
    ],
    'Streams API': [
      { title: 'Oracle Docs: java.util.stream', link: 'https://docs.oracle.com/javase/8/docs/api/java/util/stream/package-summary.html' },
      { title: 'Baeldung: Java 8 Streams', link: 'https://www.baeldung.com/java-8-streams' }
    ],
    'Functional Interfaces and Lambdas': [
      { title: 'Oracle Tutorial: Lambda Expressions', link: 'https://docs.oracle.com/javase/tutorial/java/javaOO/lambdaexpressions.html' },
      { title: 'Baeldung: Functional Interfaces', link: 'https://www.baeldung.com/java-8-functional-interfaces' }
    ],
    Immutability: [
      { title: 'Oracle Tutorial: Immutability Strategies', link: 'https://docs.oracle.com/javase/tutorial/essential/concurrency/imstrat.html' },
      { title: 'Baeldung: Immutable Classes', link: 'https://www.baeldung.com/java-immutable-class' }
    ],
    Annotations: [
      { title: 'Oracle Tutorial: Annotations', link: 'https://docs.oracle.com/javase/tutorial/java/annotations/' },
      { title: 'Baeldung: Custom Annotations', link: 'https://www.baeldung.com/java-custom-annotation' }
    ],
    'Input / Output and NIO': [
      { title: 'Oracle Tutorial: Java I/O', link: 'https://docs.oracle.com/javase/tutorial/essential/io/' },
      { title: 'Baeldung: Java NIO 2', link: 'https://www.baeldung.com/java-nio-2-file-api' }
    ],
    'Networking Basics': [
      { title: 'Oracle Tutorial: Networking', link: 'https://docs.oracle.com/javase/tutorial/networking/overview/index.html' },
      { title: 'Baeldung: Java Sockets', link: 'https://www.baeldung.com/a-guide-to-java-sockets' }
    ],
    'JDBC Fundamentals': [
      { title: 'Oracle Tutorial: JDBC Basics', link: 'https://docs.oracle.com/javase/tutorial/jdbc/basics/index.html' },
      { title: 'Baeldung: JDBC', link: 'https://www.baeldung.com/java-jdbc' }
    ],
    'Spring Boot Fundamentals': [
      { title: 'Spring Guide: Building an Application', link: 'https://spring.io/guides/gs/spring-boot/' },
      { title: 'Baeldung: Spring Boot', link: 'https://www.baeldung.com/spring-boot' }
    ],
    'Design Patterns': [
      { title: 'Refactoring.Guru: Java Design Patterns', link: 'https://refactoring.guru/design-patterns/java' },
      { title: 'Baeldung: Design Patterns', link: 'https://www.baeldung.com/tag/design-patterns' }
    ]
  },
  Python: {
    Functions: [
      { title: 'Python Docs: Defining Functions', link: 'https://docs.python.org/3/tutorial/controlflow.html#defining-functions' },
      { title: 'Real Python: Python Functions', link: 'https://realpython.com/defining-your-own-python-function/' }
    ],
    'Object Oriented Programming': [
      { title: 'Python Docs: Classes', link: 'https://docs.python.org/3/tutorial/classes.html' },
      { title: 'Real Python: OOP in Python', link: 'https://realpython.com/python3-object-oriented-programming/' }
    ],
    'Iterators and Generators': [
      { title: 'Python Docs: Iterators', link: 'https://docs.python.org/3/tutorial/classes.html#iterators' },
      { title: 'Real Python: Generators', link: 'https://realpython.com/introduction-to-python-generators/' }
    ],
    'List and Dict Comprehensions': [
      { title: 'Python Docs: List Comprehensions', link: 'https://docs.python.org/3/tutorial/datastructures.html#list-comprehensions' },
      { title: 'Real Python: List Comprehensions', link: 'https://realpython.com/list-comprehension-python/' }
    ],
    'Exception Handling': [
      { title: 'Python Docs: Errors and Exceptions', link: 'https://docs.python.org/3/tutorial/errors.html' },
      { title: 'Real Python: Exceptions', link: 'https://realpython.com/python-exceptions/' }
    ],
    Decorators: [
      { title: 'Python Docs: Decorators', link: 'https://docs.python.org/3/glossary.html#term-decorator' },
      { title: 'Real Python: Decorators', link: 'https://realpython.com/primer-on-python-decorators/' }
    ],
    'Typing and Type Hints': [
      { title: 'Python Docs: typing module', link: 'https://docs.python.org/3/library/typing.html' },
      { title: 'Real Python: Type Checking', link: 'https://realpython.com/python-type-checking/' }
    ],
    'Asyncio Basics': [
      { title: 'Python Docs: asyncio', link: 'https://docs.python.org/3/library/asyncio.html' },
      { title: 'Real Python: Async IO', link: 'https://realpython.com/async-io-python/' }
    ],
    'Context Managers': [
      { title: 'Python Docs: Context Managers', link: 'https://docs.python.org/3/reference/datamodel.html#context-managers' },
      { title: 'Real Python: Context Managers', link: 'https://realpython.com/python-with-statement/' }
    ],
    'Modules and Packaging': [
      { title: 'Python Docs: Modules', link: 'https://docs.python.org/3/tutorial/modules.html' },
      { title: 'Real Python: Modules and Packages', link: 'https://realpython.com/python-modules-packages/' }
    ],
    'Unit Testing': [
      { title: 'Python Docs: unittest', link: 'https://docs.python.org/3/library/unittest.html' },
      { title: 'Real Python: Testing', link: 'https://realpython.com/python-testing/' }
    ],
    'Data Classes': [
      { title: 'Python Docs: dataclasses', link: 'https://docs.python.org/3/library/dataclasses.html' },
      { title: 'Real Python: Data Classes', link: 'https://realpython.com/python-data-classes/' }
    ]
  },
  JavaScript: {
    Closures: [
      { title: 'MDN: Closures', link: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures' },
      { title: 'javascript.info: Closures', link: 'https://javascript.info/closure' }
    ],
    'Event Loop': [
      { title: 'MDN: Event Loop', link: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/EventLoop' },
      { title: 'javascript.info: Event Loop', link: 'https://javascript.info/event-loop' }
    ],
    'Promises and Async': [
      { title: 'MDN: Using Promises', link: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises' },
      { title: 'javascript.info: Promises', link: 'https://javascript.info/promise-basics' }
    ],
    Prototype: [
      { title: 'MDN: Object Prototypes', link: 'https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Objects/Object_prototypes' },
      { title: 'javascript.info: Prototypal Inheritance', link: 'https://javascript.info/prototype-inheritance' }
    ],
    'DOM Basics': [
      { title: 'MDN: DOM Introduction', link: 'https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Introduction' },
      { title: 'javascript.info: DOM Nodes', link: 'https://javascript.info/dom-nodes' }
    ],
    'Fetch and HTTP': [
      { title: 'MDN: Using Fetch', link: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch' },
      { title: 'javascript.info: Fetch', link: 'https://javascript.info/fetch' }
    ],
    'ES Modules': [
      { title: 'MDN: JavaScript Modules', link: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules' },
      { title: 'javascript.info: Modules', link: 'https://javascript.info/modules-intro' }
    ],
    Classes: [
      { title: 'MDN: Classes', link: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes' },
      { title: 'javascript.info: Classes', link: 'https://javascript.info/class' }
    ],
    'Type Coercion': [
      { title: 'MDN: Type Coercion', link: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#type_coercion' },
      { title: 'javascript.info: Type Conversions', link: 'https://javascript.info/type-conversions' }
    ],
    'Array Methods': [
      { title: 'MDN: Array', link: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array' },
      { title: 'javascript.info: Array Methods', link: 'https://javascript.info/array-methods' }
    ],
    'Error Handling': [
      { title: 'MDN: Error Handling', link: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Control_flow_and_error_handling#exception_handling_statements' },
      { title: 'javascript.info: try..catch', link: 'https://javascript.info/try-catch' }
    ],
    'Web Storage': [
      { title: 'MDN: Web Storage API', link: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API' },
      { title: 'javascript.info: localStorage', link: 'https://javascript.info/localstorage' }
    ]
  }
};

function normalizeTopicKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pickReferencesByFuzzyMatch(topic, map) {
  const normalized = normalizeTopicKey(topic);
  if (!normalized) return null;
  const entries = Object.entries(map || {});
  const exact = entries.find(([key]) => normalizeTopicKey(key) === normalized);
  if (exact) return exact[1];

  const tokens = normalized.split(' ').filter(Boolean);
  let best = null;
  let bestScore = 0;
  for (const [key, links] of entries) {
    const nk = normalizeTopicKey(key);
    if (!nk) continue;
    const keyTokens = nk.split(' ').filter(Boolean);
    const matches = keyTokens.filter((t) => tokens.includes(t)).length;
    if (matches > bestScore) {
      bestScore = matches;
      best = links;
    }
  }
  return bestScore > 0 ? best : null;
}

function languageOverviewLink(language) {
  const lang = String(language || '').toLowerCase();
  if (lang === 'python') return 'https://docs.python.org/3/tutorial/';
  if (lang === 'java') return 'https://docs.oracle.com/javase/tutorial/';
  if (lang === 'c++' || lang === 'cpp') return 'https://en.cppreference.com/w/';
  if (lang === 'c') return 'https://en.cppreference.com/w/c/language';
  if (lang === 'javascript') return 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide';
  return 'https://www.geeksforgeeks.org/';
}

function fallbackReferences(topic, language, section) {
  const wiki = `https://en.wikipedia.org/wiki/${encodeURIComponent(String(topic || '').trim())}`;
  const normalizedSection = String(section || 'DSA').toUpperCase();
  if (normalizedSection !== 'DSA') {
    return [
      { title: `${language} documentation`, link: languageOverviewLink(language) },
      { title: `Wikipedia: ${topic}`, link: wiki }
    ];
  }
  return [
    { title: `Wikipedia: ${topic}`, link: wiki },
    { title: 'CP-Algorithms: Data Structures', link: 'https://cp-algorithms.com/' }
  ];
}

async function buildReferenceLinks(topic, language, section) {
  // Use Google Custom Search API to get best web links for the topic
  if (!env.googleCseApiKey || !env.googleCseCx) return fallbackReferences(topic, language || 'programming', section);
  const query = [topic, language, 'tutorial'].filter(Boolean).join(' ');
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', env.googleCseApiKey);
  url.searchParams.set('cx', env.googleCseCx);
  url.searchParams.set('q', query);
  url.searchParams.set('num', '4');
  url.searchParams.set('safe', 'active');
  let items = [];
  try {
    const data = await fetchJson(url.toString());
    items = Array.isArray(data?.items) ? data.items : [];
  } catch {
    return fallbackReferences(topic, language || 'programming', section);
  }
  // Filter out YouTube and return top 2 best web links
  const links = items
    .filter((it) => it.link && !/youtube\.com|youtu\.be/.test(it.link))
    .slice(0, 2)
    .map((it) => ({ title: it.title, link: it.link }));
  return links.length ? links : fallbackReferences(topic, language || 'programming', section);
}

function refineTopicForSearch(topic) {
  const lower = String(topic || '').toLowerCase();
  const dsaKeywords = [
    'array', 'linked list', 'stack', 'queue', 'two pointers', 'sliding window', 'prefix sums', 'hashing',
    'binary search', 'binary search tree', 'heap', 'priority queue', 'trie', 'disjoint set', 'dsu',
    'graph traversal', 'bfs', 'dfs', 'topological sort', 'greedy', 'shortest paths', 'dijkstra',
    'minimum spanning tree', 'merge sort', 'quick sort', 'backtracking', 'dynamic programming', 'bit manipulation'
  ];
  const isDsa = dsaKeywords.some((kw) => lower.includes(kw));
  if (isDsa) return `${topic} data structure`;
  return topic;
}

function buildSpokenPreferenceList(spoken, spokenSecondary) {
  const prefs = [];
  const push = (value) => {
    const v = String(value || '').trim();
    if (!v) return;
    if (prefs.some((p) => p.toLowerCase() === v.toLowerCase())) return;
    prefs.push(v);
  };
  push(spoken);
  push(spokenSecondary);
  if (!prefs.some((p) => p.toLowerCase() === 'english')) push('English');
  return prefs;
}

function buildQuery(refinedTopic, language, spokenPref) {
  const spokenPhrase = spokenPref ? `for ${spokenPref} speakers` : '';
  return [refinedTopic, 'in', language, 'tutorial', spokenPhrase].filter(Boolean).join(' ');
}

function filterVideosByTopic(topic, videos) {
  const lowerTopic = String(topic || '').toLowerCase();
  const banned = ['interview questions', 'salary', 'developer salary', 'which language', 'vs', 'best language', 'career', 'full stack developer'];
  const topicTokens = lowerTopic.split(/\s+/).filter(Boolean);
  const extraTokens = [];
  if (lowerTopic.includes('stack')) extraTokens.push('push', 'pop', 'stack data structure');
  if (lowerTopic.includes('queue')) extraTokens.push('enqueue', 'dequeue', 'queue data structure');
  if (lowerTopic.includes('linked list')) extraTokens.push('linked list');
  const mustMatch = [...topicTokens, ...extraTokens];

  const isRelevant = (text) => {
    const lt = String(text || '').toLowerCase();
    if (lt.includes('full stack developer')) return false;
    if (banned.some((b) => lt.includes(b))) return false;
    return mustMatch.some((t) => lt.includes(t));
  };

  return videos.filter((v) => {
    const title = v?.title || '';
    const desc = v?.description || '';
    return isRelevant(title) || isRelevant(desc);
  });
}

async function readFirestoreCache(key) {
  const data = await getCache(key);
  return data?.youtube ?? null;
}

async function writeFirestoreCache({ key, topic, language, section, youtube }) {
  await setCache(key, { key, topic, language, section, youtube }, 7);
}

videoRouter.get('/search', async (req, res, next) => {
  try {
    const topic = String(req.query.topic ?? '').trim();
    const language = String(req.query.language ?? '').trim();
    const section = String(req.query.section ?? 'DSA').trim() || 'DSA';
    const spoken = String(req.query.spoken ?? '').trim();
    const spokenSecondary = String(req.query.spokenSecondary ?? req.query.spoken2 ?? '').trim();
    const requestedMax = Math.max(1, Math.min(10, Number(req.query.max ?? 6) || 6));
    const requestedWebMax = 0; // disable web video crawling
    const youtubeMax = Math.min(6, requestedMax);
    const webMax = 0;
    if (!topic || !language) return res.status(400).json({ message: 'topic and language are required' });
    if (!env.youtubeApiKey && !(env.googleCseApiKey && env.googleCseCx)) {
      return res.status(500).json({ message: 'YOUTUBE_API_KEY not configured (and GOOGLE_CSE_API_KEY/GOOGLE_CSE_CX not configured)' });
    }

    // v4: include capability flags and spoken-language hints so the client can explain why web videos may be empty.
    const key = cacheKey([
      'vid',
      'v6',
      topic,
      language,
      section,
      spoken || 'none',
      spokenSecondary || 'none',
      String(youtubeMax),
      String(webMax)
    ]);

    const capabilities = {
      youtubeEnabled: Boolean(env.youtubeApiKey || (env.googleCseApiKey && env.googleCseCx)),
      webVideosEnabled: false
    };

    const mem = memCache.get(key);
    if (mem) return res.json({ source: 'memory', ...capabilities, ...mem });

    const cached = await readFirestoreCache(key);
    if (cached) {
      memCache.set(key, cached);
      return res.json({ source: 'firestore', ...capabilities, ...cached });
    }

    const refinedTopic = refineTopicForSearch(topic);
    const spokenPreferences = buildSpokenPreferenceList(spoken, spokenSecondary);
    const queries = (spokenPreferences.length ? spokenPreferences : [null]).map((pref) =>
      buildQuery(refinedTopic, language, pref)
    );
    if (!queries.length) queries.push(buildQuery(refinedTopic, language, null));
    const primaryQuery = queries[0] || buildQuery(refinedTopic, language, null);

    const fetchVideosForQuery = async (query, limit) => {
      let list = [];
      if (env.youtubeApiKey && limit > 0) {
        try {
          const url = new URL('https://www.googleapis.com/youtube/v3/search');
          url.searchParams.set('key', env.youtubeApiKey);
          url.searchParams.set('part', 'snippet');
          url.searchParams.set('type', 'video');
          url.searchParams.set('maxResults', String(limit));
          url.searchParams.set('q', query);
          url.searchParams.set('videoDuration', 'medium');
          url.searchParams.set('safeSearch', 'strict');

          const data = await fetchJson(url.toString());
          const items = Array.isArray(data?.items) ? data.items : [];
          list = items
            .map((item) => {
              const videoId = item?.id?.videoId;
              if (!videoId) return null;
              return {
                videoId,
                title: item?.snippet?.title ?? 'YouTube Video',
                description: item?.snippet?.description ?? '',
                thumbnail: item?.snippet?.thumbnails?.high?.url ?? item?.snippet?.thumbnails?.default?.url ?? null,
                channelTitle: item?.snippet?.channelTitle ?? null
              };
            })
            .filter(Boolean);
        } catch {
          /* fall back to CSE */
        }
      }

      if (list.length < limit) {
        try {
          const extra = await tryGoogleCseVideos(query, limit);
          const seen = new Set(list.map((v) => v.videoId));
          for (const v of extra) {
            if (seen.has(v.videoId)) continue;
            list.push(v);
            seen.add(v.videoId);
            if (list.length >= limit) break;
          }
        } catch {
          /* ignore */
        }
      }

      return list;
    };

    let videos = [];
    const seenVideos = new Set();
    let lastQueryUsed = primaryQuery;
    for (const q of queries) {
      if (videos.length >= youtubeMax) break;
      const batch = await fetchVideosForQuery(q, youtubeMax - videos.length);
      for (const v of filterVideosByTopic(topic, batch)) {
        if (seenVideos.has(v.videoId)) continue;
        videos.push(v);
        seenVideos.add(v.videoId);
        lastQueryUsed = q || lastQueryUsed;
        if (videos.length >= youtubeMax) break;
      }
    }

    if (videos.length < youtubeMax) {
      try {
        const fallbackQuery = buildQuery(`${refinedTopic} data structure`, language, 'English');
        const extra = await fetchVideosForQuery(fallbackQuery, youtubeMax - videos.length);
        for (const v of filterVideosByTopic(topic, extra)) {
          if (seenVideos.has(v.videoId)) continue;
          videos.push(v);
          seenVideos.add(v.videoId);
          lastQueryUsed = fallbackQuery;
          if (videos.length >= youtubeMax) break;
        }
      } catch {
        /* ignore */
      }
    }

    if (videos.length > youtubeMax) {
      videos = videos.slice(0, youtubeMax);
    }

    const webVideos = []; // disabled per requirement

    if (!videos.length && !webVideos.length) return res.status(404).json({ message: 'No video found' });

    const first = videos[0] || null;
    const queryUsed = lastQueryUsed || primaryQuery;
    const referenceLinks = await buildReferenceLinks(topic, language, section);
    const payload = first
      ? { query: queryUsed, ...first, videos, webVideos, referenceLinks }
      : {
          query: queryUsed,
          videoId: null,
          title: referenceLinks[0]?.title ?? 'Reference',
          description: referenceLinks[0]?.link ?? '',
          thumbnail: null,
          channelTitle: 'Reference',
          videos: [],
          webVideos,
          referenceLinks
        };

    memCache.set(key, payload);
    await writeFirestoreCache({ key, topic, language, section, youtube: payload });

    res.json({ source: videos.length ? 'youtube' : 'web', ...capabilities, ...payload });
  } catch (e) {
    next(e);
  }
});

videoRouter.get('/oembed', async (req, res, next) => {
  try {
    const url = String(req.query.url ?? '').trim();
    if (!url) return res.status(400).json({ message: 'url is required' });

    const endpoint = new URL('https://www.youtube.com/oembed');
    endpoint.searchParams.set('url', url);
    endpoint.searchParams.set('format', 'json');

    const data = await fetchJson(endpoint.toString());
    res.json(data);
  } catch (e) {
    next(e);
  }
});
