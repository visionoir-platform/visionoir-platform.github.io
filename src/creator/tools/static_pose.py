"""Bake an editorial pose, preserving seams in the scanned clothing. No animation data is sampled."""
import numpy as np

def smooth(lo, hi, a):
    t = np.clip((a - lo) / (hi - lo), 0., 1.)
    return t * t * (3. - 2. * t)

def pose(points):
    # Pivot and blend in original bind-space metres. Coincident vertices belonging
    # to the sleeve, shirt or trouser seams undergo exactly the same deformation.
    p = points.copy()
    y = p[:,1].copy()
    def turn(pivot, degrees, axis, blend):
        angle = np.deg2rad(degrees) * blend
        u,v = [(1,2),(2,0),(0,1)][axis]
        a = p[:,u] - pivot[u]; b = p[:,v] - pivot[v]
        p[:,u] = pivot[u] + a*np.cos(angle) - b*np.sin(angle)
        p[:,v] = pivot[v] + a*np.sin(angle) + b*np.cos(angle)
    upper = smooth(1.06,1.42,y)
    head = smooth(1.40,1.54,y)
    # Work from small local pivots out to the broad body turn.
    turn((0,1.45,.02),24,1,head)
    turn((0,1.45,.02),11,0,head)
    turn((0,1.45,.02),4,2,head)
    turn((0,1.18,.01),-4,1,upper)
    turn((0,1.18,.01),3,0,upper)
    turn((0,.92,0),-4,2,smooth(.72,1.41,y))
    turn((0,.92,0),-18,1,1.)
    return p

def bake_pose(scene, original):
    data = bytearray(original)
    def accessor(index):
        a = scene['accessors'][index]
        view = scene['bufferViews'][a['bufferView']]
        if a['componentType']!=5126 or a['type']!='VEC3' or view.get('byteStride',12)!=12:
            raise ValueError('Expected tightly packed float vertices')
        return np.frombuffer(data,dtype='<f4',count=3*a['count'],
            offset=view.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,3)
    for primitive in scene['meshes'][0]['primitives']:
        attr = primitive['attributes']
        xyz = accessor(attr['POSITION']); normals = accessor(attr['NORMAL'])
        original_xyz = xyz.astype(np.float64)
        # Inverse transpose of the warp Jacobian keeps the lighting continuous at the neck.
        delta=0.00005; derivatives=[]
        for axis in range(3):
            d=np.eye(3)[axis]*delta
            derivatives.append((pose(original_xyz+d)-pose(original_xyz-d))/(2*delta))
        jac=np.stack(derivatives,axis=-1)
        n=np.linalg.solve(jac.transpose(0,2,1),normals[:,:,None])[:,:,0]
        normals[:] = n/np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-8)
        xyz[:] = pose(original_xyz)
        a=scene['accessors'][attr['POSITION']]
        a['min']=xyz.min(axis=0).tolist();a['max']=xyz.max(axis=0).tolist()
    return memoryview(data)
