import Foundation
import FirebaseFirestore

enum FirestoreAsyncError: Error {
    case missingResult
}

extension WriteBatch {
    func commitAsync() async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            commit { error in
                if let error {
                    cont.resume(throwing: error)
                } else {
                    cont.resume()
                }
            }
        }
    }
}

extension DocumentReference {
    func setDataAsync(_ data: [String: Any], merge: Bool) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            setData(data, merge: merge) { error in
                if let error {
                    cont.resume(throwing: error)
                } else {
                    cont.resume()
                }
            }
        }
    }

    func updateDataAsync(_ fields: [String: Any]) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            updateData(fields) { error in
                if let error {
                    cont.resume(throwing: error)
                } else {
                    cont.resume()
                }
            }
        }
    }

    func getDocumentAsync() async throws -> DocumentSnapshot {
        try await withCheckedThrowingContinuation { cont in
            getDocument { snapshot, error in
                if let error {
                    cont.resume(throwing: error)
                } else if let snapshot {
                    cont.resume(returning: snapshot)
                } else {
                    cont.resume(throwing: FirestoreAsyncError.missingResult)
                }
            }
        }
    }
}

extension Firestore {
    func runTransactionAsync(_ updateBlock: @escaping (Transaction, NSErrorPointer) -> Any?) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            runTransaction({ transaction, errorPointer in
                updateBlock(transaction, errorPointer)
            }) { _, error in
                if let error {
                    cont.resume(throwing: error)
                } else {
                    cont.resume()
                }
            }
        }
    }
}
